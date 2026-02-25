mod clipboard;
mod commands;
mod db;
mod platform;

use commands::clipboard as clip_cmd;
use db::models::ContentType;
use tauri::{
    Emitter, Listener, Manager,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_x::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }));

    // Register NSPanel plugin on macOS (no-op on other platforms)
    let builder = platform::apply_plugin(builder);

    builder
        .invoke_handler(tauri::generate_handler![
            clip_cmd::get_clipboard_items,
            clip_cmd::search_clipboard_items,
            clip_cmd::get_thumbnail,
            clip_cmd::delete_clipboard_item,
            clip_cmd::paste_clipboard_item,
            clip_cmd::paste_as_plain_text,
            clip_cmd::toggle_favorite,
            clip_cmd::get_favorited_items,
            clip_cmd::get_settings,
            clip_cmd::get_setting,
            clip_cmd::set_setting,
            clip_cmd::clear_history,
            clip_cmd::run_retention_cleanup,
            clip_cmd::unregister_shortcut,
            clip_cmd::register_shortcut,
            clip_cmd::open_settings_window,
            clip_cmd::hide_window,
            clip_cmd::show_copy_hud,
        ])
        .setup(|app| {
            // Initialize database
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async {
                db::init(&app_handle)
                    .await
                    .expect("Failed to initialize database");
            });

            // Initialize platform (convert window to NSPanel on macOS)
            platform::init_platform(app)?;

            // Initialize HUD panel (non-activating copy feedback)
            if let Err(e) = platform::init_hud_panel(app) {
                log::warn!("Failed to init HUD panel: {}", e);
            }

            // Setup system tray
            setup_tray(app)?;

            // Register global shortcut
            setup_global_shortcut(app.handle())?;

            // Setup focus-loss hiding for main window
            setup_blur_hide(app.handle());

            // Start clipboard monitoring
            let app_handle = app.handle().clone();
            start_clipboard_monitor(app_handle);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Show the main window: full-width at bottom of screen, animate in.
pub fn show_main_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    // Position at bottom of primary monitor, spanning full width
    if let Ok(Some(monitor)) = window.current_monitor() {
        let monitor_size = monitor.size();
        let monitor_pos = monitor.position();
        let scale = monitor.scale_factor();

        let screen_w = monitor_size.width as f64 / scale;
        let screen_h = monitor_size.height as f64 / scale;

        let margin_x = 6.0_f64;
        let margin_bottom = 6.0_f64;
        let win_width = screen_w - margin_x * 2.0;
        let win_height = 380.0_f64;

        let x = monitor_pos.x as f64 / scale + margin_x;
        let y = monitor_pos.y as f64 / scale + screen_h - win_height - margin_bottom;

        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(
            win_width, win_height,
        )));
        let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(
            x, y,
        )));
    }

    // Sync window effects with current theme before showing
    let pool = app.state::<db::DbPool>();
    let theme = tauri::async_runtime::block_on(async {
        db::queries::get_setting(&pool.0, "theme").await.ok().flatten()
    }).unwrap_or_else(|| "dark".to_string());
    commands::clipboard::update_window_effects_for_theme(app, &theme);

    platform::platform_show_window(app);
    let _ = app.emit("recopy-show", ());
}

/// Hide the main window.
pub fn hide_main_window(app: &tauri::AppHandle) {
    platform::platform_hide_window(app);
}

fn detect_language(app: &tauri::App) -> String {
    let pool = app.state::<db::DbPool>();
    // Read language setting from DB
    if let Ok(Some(lang)) = tauri::async_runtime::block_on(db::queries::get_setting(&pool.0, "language")) {
        if lang == "zh" || lang == "en" {
            return lang;
        }
    }
    // Fallback: detect system language
    let locale = sys_locale::get_locale().unwrap_or_else(|| "en".to_string());
    if locale.starts_with("zh") { "zh".to_string() } else { "en".to_string() }
}

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let lang = detect_language(app);
    let (show_label, settings_label, quit_label) = if lang == "zh" {
        ("显示 Recopy", "设置...", "退出")
    } else {
        ("Show Recopy", "Settings...", "Quit")
    };

    let show = MenuItemBuilder::with_id("show", show_label).build(app)?;
    let settings = MenuItemBuilder::with_id("settings", settings_label).build(app)?;
    let quit = MenuItemBuilder::with_id("quit", quit_label).build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show)
        .separator()
        .item(&settings)
        .separator()
        .item(&quit)
        .build()?;

    let icon_bytes = if cfg!(target_os = "macos") {
        include_bytes!("../icons/tray-icon.png").as_slice()
    } else {
        include_bytes!("../icons/tray-icon-win.png").as_slice()
    };
    let icon = tauri::image::Image::from_bytes(icon_bytes)?;

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                show_main_window(app);
            }
            "settings" => {
                open_settings_window(app);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn open_settings_window(app: &tauri::AppHandle) {
    // Delegate to the shared helper used by both tray menu and Tauri command
    crate::open_settings_window_impl(app);
}

/// Shared settings window creation logic.
/// Re-registers global shortcut on window close to guard against
/// the shortcut recorder leaving it unregistered.
pub fn open_settings_window_impl(app: &tauri::AppHandle) {
    // If settings window already exists, just show it
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let url = tauri::WebviewUrl::App("index.html?page=settings".into());
    let window = match tauri::WebviewWindowBuilder::new(app, "settings", url)
        .title("Recopy Settings")
        .inner_size(640.0, 520.0)
        .min_inner_size(540.0, 400.0)
        .resizable(true)
        .center()
        .build()
    {
        Ok(w) => w,
        Err(e) => {
            log::error!("Failed to open settings window: {}", e);
            return;
        }
    };

    let app_clone = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

            let shortcut = tauri::async_runtime::block_on(async {
                if let Some(pool) = app_clone.try_state::<db::DbPool>() {
                    db::queries::get_setting(&pool.0, "shortcut")
                        .await
                        .unwrap_or(None)
                        .unwrap_or_else(|| "CommandOrControl+Shift+V".to_string())
                } else {
                    "CommandOrControl+Shift+V".to_string()
                }
            });

            let _ = app_clone.global_shortcut().unregister_all();
            let app_inner = app_clone.clone();
            let _ = app_clone.global_shortcut().on_shortcut(
                shortcut.as_str(),
                move |_app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if platform::platform_is_visible(&app_inner) {
                            hide_main_window(&app_inner);
                        } else {
                            show_main_window(&app_inner);
                        }
                    }
                },
            );
            log::info!("Global shortcut re-registered after settings window closed");
        }
    });
}

fn setup_global_shortcut(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    let shortcut = if let Some(pool) = app.try_state::<db::DbPool>() {
        tauri::async_runtime::block_on(async {
            db::queries::get_setting(&pool.0, "shortcut")
                .await
                .unwrap_or(None)
                .unwrap_or_else(|| "CommandOrControl+Shift+V".to_string())
        })
    } else {
        "CommandOrControl+Shift+V".to_string()
    };

    let app_handle = app.clone();
    app.global_shortcut().on_shortcut(
        shortcut.as_str(),
        move |_app, _shortcut, event| {
            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                if platform::platform_is_visible(&app_handle) {
                    hide_main_window(&app_handle);
                } else {
                    show_main_window(&app_handle);
                }
            }
        },
    )?;

    log::info!("Global shortcut registered: {}", shortcut);
    Ok(())
}

fn setup_blur_hide(app: &tauri::AppHandle) {
    // On macOS with NSPanel, focus events come via tauri://blur emitted
    // by the panel event handler (window_did_resign_key).
    // On other platforms, use the standard WindowEvent::Focused(false).
    #[cfg(target_os = "macos")]
    {
        let app_handle = app.clone();
        app.listen("tauri://blur", move |_event| {
            // Skip if the panel is not currently visible (blur from settings window etc.)
            if !platform::platform_is_visible(&app_handle) {
                return;
            }

            let app_handle = app_handle.clone();
            let should_hide = tauri::async_runtime::block_on(async {
                if let Some(pool) = app_handle.try_state::<db::DbPool>() {
                    db::queries::get_setting(&pool.0, "close_on_blur")
                        .await
                        .unwrap_or(None)
                        .unwrap_or_else(|| "true".to_string())
                } else {
                    "true".to_string()
                }
            });
            if should_hide == "true" {
                hide_main_window(&app_handle);
            }
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        if let Some(window) = app.get_webview_window("main") {
            let w = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::Focused(false) = event {
                    let app_handle = w.app_handle();
                    let should_hide = tauri::async_runtime::block_on(async {
                        if let Some(pool) = app_handle.try_state::<db::DbPool>() {
                            db::queries::get_setting(&pool.0, "close_on_blur")
                                .await
                                .unwrap_or(None)
                                .unwrap_or_else(|| "true".to_string())
                        } else {
                            "true".to_string()
                        }
                    });
                    if should_hide == "true" {
                        let _ = w.hide();
                    }
                }
            });
        }
    }
}

fn start_clipboard_monitor(app: tauri::AppHandle) {
    let app_clone = app.clone();

    tauri::async_runtime::spawn(async move {
        // Start the clipboard watcher via the plugin's command
        if let Err(e) = tauri_plugin_clipboard_x::start_listening(app_clone.clone()).await {
            log::error!("Failed to start clipboard listener: {}", e);
            return;
        }
        log::info!("Clipboard monitor started");

        // Listen for clipboard change events
        let app_for_listener = app_clone.clone();
        app_clone.listen(
            "plugin:clipboard-x://clipboard_changed",
            move |_event: tauri::Event| {
                let app_inner = app_for_listener.clone();
                tauri::async_runtime::spawn(async move {
                    handle_clipboard_event(&app_inner).await;
                });
            },
        );
    });
}

async fn handle_clipboard_event(app: &tauri::AppHandle) {
    // Determine content type and read clipboard
    let (content_type, content, plain_text, rich_content, file_path, file_name) =
        match extract_clipboard_content(app).await {
            Some(data) => data,
            None => return,
        };

    log::info!("Clipboard changed: type={}", content_type.as_str());

    // Process and store
    let result = clip_cmd::process_clipboard_change(
        app,
        content_type,
        content,
        plain_text,
        rich_content,
        file_path,
        file_name,
        String::new(), // source_app - TODO: M1-8
        String::new(), // source_app_name - TODO: M1-8
    )
    .await;

    match result {
        Ok(Some(id)) => {
            let _ = app.emit("clipboard-changed", serde_json::json!({ "id": id }));
        }
        Ok(None) => {}
        Err(e) => log::error!("Failed to process clipboard: {}", e),
    }
}

async fn extract_clipboard_content(
    app: &tauri::AppHandle,
) -> Option<(
    ContentType,
    Vec<u8>,
    Option<String>,
    Option<Vec<u8>>,
    Option<String>,
    Option<String>,
)> {
    // Read max item size from DB settings
    let max_size_mb = if let Some(pool) = app.try_state::<db::DbPool>() {
        db::queries::get_setting(&pool.0, "max_item_size_mb")
            .await
            .unwrap_or(None)
            .and_then(|v| v.parse::<usize>().ok())
            .unwrap_or(clipboard::DEFAULT_MAX_ITEM_SIZE_MB)
    } else {
        clipboard::DEFAULT_MAX_ITEM_SIZE_MB
    };

    // Try files first
    if let Ok(true) = tauri_plugin_clipboard_x::has_files().await {
        if let Ok(file_result) = tauri_plugin_clipboard_x::read_files().await {
            if let Some(first) = file_result.paths.first() {
                let path = std::path::Path::new(first);

                // Skip directories
                if path.is_dir() {
                    log::info!("Skipping directory: {}", first);
                    return None;
                }

                // Skip files larger than size limit
                if let Ok(meta) = path.metadata() {
                    if clipboard::exceeds_size_limit(meta.len() as usize, max_size_mb) {
                        log::info!(
                            "Skipping large file: {} ({}B)",
                            first,
                            meta.len()
                        );
                        return None;
                    }
                }

                let file_name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string());
                let content = first.as_bytes().to_vec();
                return Some((
                    ContentType::File,
                    content,
                    Some(first.clone()),
                    None,
                    Some(first.clone()),
                    file_name,
                ));
            }
        }
    }

    // Try image
    if let Ok(true) = tauri_plugin_clipboard_x::has_image().await {
        if let Ok(img_result) = tauri_plugin_clipboard_x::read_image(app.clone(), None).await {
            // Read the saved image file
            if let Ok(img_data) = std::fs::read(&img_result.path) {
                return Some((ContentType::Image, img_data, None, None, None, None));
            }
        }
    }

    // Try HTML (rich text)
    if let Ok(true) = tauri_plugin_clipboard_x::has_html().await {
        if let Ok(html) = tauri_plugin_clipboard_x::read_html().await {
            let plain = tauri_plugin_clipboard_x::read_text().await.unwrap_or_default();
            let html_bytes = html.as_bytes().to_vec();
            let content_bytes = plain.as_bytes().to_vec();
            return Some((
                ContentType::RichText,
                content_bytes,
                Some(plain),
                Some(html_bytes),
                None,
                None,
            ));
        }
    }

    // Try plain text
    if let Ok(true) = tauri_plugin_clipboard_x::has_text().await {
        if let Ok(text) = tauri_plugin_clipboard_x::read_text().await {
            if !text.is_empty() {
                let content = text.as_bytes().to_vec();
                return Some((ContentType::PlainText, content, Some(text), None, None, None));
            }
        }
    }

    None
}
