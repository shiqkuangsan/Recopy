mod clipboard;
mod commands;
mod db;
mod platform;

use commands::clipboard as clip_cmd;
use db::models::ContentType;
use std::sync::atomic::{AtomicBool, Ordering};

/// Flag to skip the next clipboard change event (set before self-initiated writes).
static SKIP_NEXT_CLIPBOARD_CHANGE: AtomicBool = AtomicBool::new(false);

/// Set the skip flag before writing to clipboard (called from commands).
pub fn set_skip_next_clipboard_change() {
    SKIP_NEXT_CLIPBOARD_CHANGE.store(true, Ordering::SeqCst);
}

/// Clear the skip flag (called when clipboard write fails).
pub fn clear_skip_next_clipboard_change() {
    SKIP_NEXT_CLIPBOARD_CHANGE.store(false, Ordering::SeqCst);
}
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Listener, Manager,
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

    // Register updater + process plugins (gated behind self-update feature for App Store compat)
    #[cfg(feature = "self-update")]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .invoke_handler(tauri::generate_handler![
            clip_cmd::get_clipboard_items,
            clip_cmd::search_clipboard_items,
            clip_cmd::get_thumbnail,
            clip_cmd::get_item_detail,
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
            clip_cmd::open_url,
            clip_cmd::open_settings_window,
            clip_cmd::show_preview_window,
            clip_cmd::hide_preview_window,
            clip_cmd::animate_close_preview,
            clip_cmd::get_current_preview,
            clip_cmd::read_file_preview,
            clip_cmd::hide_window,
            clip_cmd::show_copy_hud,
        ])
        .setup(|app| {
            // Hide dock icon (tao overrides LSUIElement at startup, so must set programmatically)
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Initialize database
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async {
                db::init(&app_handle)
                    .await
                    .expect("Failed to initialize database");
            });

            // Initialize preview state for Quick Look feature
            app.manage(db::models::PreviewState(std::sync::Mutex::new(None)));
            app.manage(db::models::PreviewClosing(
                std::sync::atomic::AtomicBool::new(false),
            ));

            // Initialize NSPanel store (must be before init_platform which stores panels)
            #[cfg(target_os = "macos")]
            app.manage(platform::nspanel::PanelStore::new());

            // Initialize platform (convert window to NSPanel on macOS)
            platform::init_platform(app)?;

            // Initialize HUD panel (non-activating copy feedback)
            if let Err(e) = platform::init_hud_panel(app) {
                log::warn!("Failed to init HUD panel: {}", e);
            }

            // Initialize preview panel (non-activating Quick Look)
            if let Err(e) = platform::init_preview_panel(app) {
                log::warn!("Failed to init preview panel: {}", e);
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

            // Cleanup orphan image files left from previous sessions (best-effort)
            let app_handle_gc = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                commands::clipboard::cleanup_orphan_images(&app_handle_gc).await;
            });

            // Run retention cleanup on startup (FR-018)
            let app_handle_ret = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let pool = match app_handle_ret.try_state::<db::DbPool>() {
                    Some(p) => p,
                    None => return,
                };
                let policy = db::queries::get_setting(&pool.0, "retention_policy")
                    .await
                    .ok()
                    .flatten()
                    .unwrap_or_else(|| "unlimited".to_string());

                if policy == "unlimited" {
                    return;
                }

                let days = db::queries::get_setting(&pool.0, "retention_days")
                    .await
                    .ok()
                    .flatten()
                    .and_then(|v| v.parse::<i64>().ok())
                    .unwrap_or(30);
                let count = db::queries::get_setting(&pool.0, "retention_count")
                    .await
                    .ok()
                    .flatten()
                    .and_then(|v| v.parse::<i64>().ok())
                    .unwrap_or(1000);

                // Collect image paths before deleting rows
                let image_paths =
                    db::queries::get_retention_overflow_image_paths(&pool.0, &policy, days, count)
                        .await
                        .unwrap_or_default();

                match db::queries::cleanup_by_retention(&pool.0, &policy, days, count).await {
                    Ok(deleted) if deleted > 0 => {
                        log::info!("Startup retention cleanup: removed {} items", deleted);
                        for path in image_paths {
                            let _ = tokio::fs::remove_file(&path).await;
                        }
                    }
                    Err(e) => log::warn!("Startup retention cleanup failed: {}", e),
                    _ => {}
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Show the main window: position depends on `panel_position` setting.
pub fn show_main_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    // Read settings from DB before positioning
    let pool = app.state::<db::DbPool>();
    let (theme, language, update_check_interval, panel_position) =
        tauri::async_runtime::block_on(async {
            let t = db::queries::get_setting(&pool.0, "theme")
                .await
                .ok()
                .flatten();
            let l = db::queries::get_setting(&pool.0, "language")
                .await
                .ok()
                .flatten();
            let u = db::queries::get_setting(&pool.0, "update_check_interval")
                .await
                .ok()
                .flatten();
            let p = db::queries::get_setting(&pool.0, "panel_position")
                .await
                .ok()
                .flatten();
            (t, l, u, p)
        });
    let theme = theme.unwrap_or_else(|| "dark".to_string());
    let language = language.unwrap_or_else(|| "system".to_string());
    let update_check_interval = update_check_interval.unwrap_or_else(|| "weekly".to_string());
    let panel_position = panel_position.unwrap_or_else(|| "bottom".to_string());

    // Position window based on panel_position setting
    if let Ok(Some(monitor)) = window.current_monitor() {
        let monitor_size = monitor.size();
        let monitor_pos = monitor.position();
        let scale = monitor.scale_factor();

        let screen_w = monitor_size.width as f64 / scale;
        let screen_h = monitor_size.height as f64 / scale;
        let mon_x = monitor_pos.x as f64 / scale;
        let mon_y = monitor_pos.y as f64 / scale;
        let margin = 6.0_f64;

        let (win_w, win_h, x, y, min_w, min_h, max_w, max_h) = match panel_position.as_str() {
            "top" => {
                let w = screen_w - margin * 2.0;
                let h = 420.0;
                // y=0: overlay menu bar (NSPanel level raised to MainMenu+1)
                (w, h, mon_x + margin, mon_y, w, 300.0, w, 800.0)
            }
            "left" => {
                // 28px top offset clears macOS menu bar (25px) + small gap
                let top_inset = 28.0_f64;
                let w = 380.0;
                let h = screen_h - top_inset - margin;
                (w, h, mon_x + margin, mon_y + top_inset, w, h, w, h)
            }
            "right" => {
                let top_inset = 38.0_f64;
                let w = 380.0;
                let h = screen_h - top_inset - margin;
                (
                    w,
                    h,
                    mon_x + screen_w - w - margin,
                    mon_y + top_inset,
                    w,
                    h,
                    w,
                    h,
                )
            }
            _ => {
                // "bottom" (default)
                let w = screen_w - margin * 2.0;
                let h = 380.0;
                (
                    w,
                    h,
                    mon_x + margin,
                    mon_y + screen_h - h - margin,
                    w,
                    300.0,
                    w,
                    800.0,
                )
            }
        };

        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(win_w, win_h)));
        let _ = window.set_min_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(
            min_w, min_h,
        ))));
        let _ = window.set_max_size(Some(tauri::Size::Logical(tauri::LogicalSize::new(
            max_w, max_h,
        ))));
        let resizable = panel_position == "bottom" || panel_position == "top";
        let _ = window.set_resizable(resizable);
        #[cfg(target_os = "windows")]
        if resizable {
            if let Some(hwnd) = window.hwnd().ok().map(|h| h.0 as isize) {
                platform::install_nchittest_hook(hwnd, &panel_position);
            }
        }
        let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
    }

    commands::clipboard::update_window_effects_for_theme(app, &theme);

    platform::platform_show_window(app, &panel_position);
    let _ = app.emit(
        "recopy-show",
        serde_json::json!({
            "theme": theme,
            "language": language,
            "update_check_interval": update_check_interval,
            "panel_position": panel_position,
        }),
    );
}

/// Hide the main window and close preview if open.
/// Emits "recopy-hide" so the frontend can reset its visual state for the next show.
pub fn hide_main_window(app: &tauri::AppHandle) {
    let _ = app.emit("recopy-hide", ());
    platform::platform_hide_window(app);
    platform::platform_hide_preview(app);
}

/// Show the preview window with adaptive sizing (pre-created at startup).
/// Positions the preview adjacent to the main panel based on `panel_position`:
/// bottom → above, top → below, left → right of, right → left of.
pub fn show_preview_window_impl(
    app: &tauri::AppHandle,
    width: f64,
    height: f64,
    panel_position: &str,
) {
    let Some(window) = app.get_webview_window("preview") else {
        return;
    };

    // Resize to match content (Tauri handles thread dispatch internally)
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)));

    // Match theme with main window
    if let Some(main_win) = app.get_webview_window("main") {
        if let Ok(theme) = main_win.theme() {
            let _ = window.set_theme(Some(theme));
        }
    }

    // Set CSS animation transform-origin to scale toward the panel edge
    let origin = match panel_position {
        "top" => "center top",
        "left" => "left center",
        "right" => "right center",
        _ => "center bottom",
    };
    let _ = window.eval(format!(
        "document.documentElement.style.setProperty('--preview-origin','{}')",
        origin
    ));

    // Position adjacent to the main panel
    let gap = 8.0;
    let positioned = (|| -> Option<()> {
        let monitor = window.current_monitor().ok()??;
        let scale = monitor.scale_factor();
        let screen_w = monitor.size().width as f64 / scale;
        let screen_h = monitor.size().height as f64 / scale;
        let mon_x = monitor.position().x as f64 / scale;
        let mon_y = monitor.position().y as f64 / scale;

        let main_win = app.get_webview_window("main")?;
        let main_pos = main_win.outer_position().ok()?;
        let main_size = main_win.outer_size().ok()?;
        let panel_x = main_pos.x as f64 / scale;
        let panel_y = main_pos.y as f64 / scale;
        let panel_w = main_size.width as f64 / scale;
        let panel_h = main_size.height as f64 / scale;

        let (x, y) = match panel_position {
            "top" => {
                // Below the panel, centered horizontally
                (mon_x + (screen_w - width) / 2.0, panel_y + panel_h + gap)
            }
            "left" => {
                // Right of the panel, centered vertically
                (panel_x + panel_w + gap, mon_y + (screen_h - height) / 2.0)
            }
            "right" => {
                // Left of the panel, centered vertically
                (panel_x - width - gap, mon_y + (screen_h - height) / 2.0)
            }
            _ => {
                // "bottom": above the panel, centered horizontally
                (mon_x + (screen_w - width) / 2.0, panel_y - height - gap)
            }
        };

        let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
        Some(())
    })();

    // Fallback: center on screen if main panel position unavailable
    if positioned.is_none() {
        let _ = window.center();
    }

    // Show panel — dispatched to main thread inside platform_show_preview
    platform::platform_show_preview(app);
}

fn detect_language(app: &tauri::App) -> String {
    let pool = app.state::<db::DbPool>();
    // Read language setting from DB
    if let Ok(Some(lang)) =
        tauri::async_runtime::block_on(db::queries::get_setting(&pool.0, "language"))
    {
        if lang == "zh" || lang == "en" {
            return lang;
        }
    }
    // Fallback: detect system language
    let locale = sys_locale::get_locale().unwrap_or_else(|| "en".to_string());
    if locale.starts_with("zh") {
        "zh".to_string()
    } else {
        "en".to_string()
    }
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
        .tooltip("Recopy")
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
        .inner_size(720.0, 560.0)
        .min_inner_size(600.0, 440.0)
        .resizable(true)
        .center()
        .build()
    {
        Ok(w) => {
            let _ = w.set_focus();
            w
        }
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
    app.global_shortcut()
        .on_shortcut(shortcut.as_str(), move |_app, _shortcut, event| {
            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                if platform::platform_is_visible(&app_handle) {
                    hide_main_window(&app_handle);
                } else {
                    show_main_window(&app_handle);
                }
            }
        })?;

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
        // Main window focus events:
        // - Focused(true):  clear preview guard (focus dance complete after show+set_focus)
        // - Focused(false): hide unless guard is active (preview opening stole focus briefly)
        if let Some(window) = app.get_webview_window("main") {
            let w = window.clone();
            window.on_window_event(move |event| match event {
                tauri::WindowEvent::Focused(true) => {
                    platform::set_preview_focus_guard(false);
                    // On Windows: user clicked Recopy → remove keyboard hook
                    // (webview now receives keyboard input directly).
                    platform::on_window_focused();
                }
                tauri::WindowEvent::Focused(false) => {
                    if platform::is_preview_focus_guard() {
                        return;
                    }
                    let app_handle = w.app_handle().clone();
                    let win = w.clone();
                    tauri::async_runtime::spawn(async move {
                        // Debounce: on Windows 11, resize and other interactions
                        // cause transient blur. Wait briefly and recheck focus.
                        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                        if win.is_focused().unwrap_or(false) {
                            return;
                        }
                        let should_hide = if let Some(pool) = app_handle.try_state::<db::DbPool>() {
                            db::queries::get_setting(&pool.0, "close_on_blur")
                                .await
                                .unwrap_or(None)
                                .unwrap_or_else(|| "true".to_string())
                        } else {
                            "true".to_string()
                        };
                        if should_hide == "true" {
                            hide_main_window(&app_handle);
                        }
                    });
                }
                _ => {}
            });
        }

        // Preview window blur (safety net): if preview somehow gets focus
        // (e.g. user clicks on it), close all when it loses focus.
        // Guard check prevents firing during the show+set_focus dance.
        if let Some(preview) = app.get_webview_window("preview") {
            let app_handle = app.clone();
            preview.on_window_event(move |event| {
                if let tauri::WindowEvent::Focused(false) = event {
                    if platform::is_preview_focus_guard() {
                        return;
                    }
                    if platform::take_preview_programmatic_hide() {
                        return;
                    }
                    let app_inner = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        let should_hide = if let Some(pool) = app_inner.try_state::<db::DbPool>() {
                            db::queries::get_setting(&pool.0, "close_on_blur")
                                .await
                                .unwrap_or(None)
                                .unwrap_or_else(|| "true".to_string())
                        } else {
                            "true".to_string()
                        };
                        if should_hide == "true" {
                            hide_main_window(&app_inner);
                        }
                    });
                }
            });
        }

        // On Windows: mouse hook emits this when user clicks outside all Recopy
        // windows (non-activating window never fires Focused(false) on its own).
        let app_click = app.clone();
        app.listen("platform-click-outside", move |_| {
            let app_inner = app_click.clone();
            tauri::async_runtime::spawn(async move {
                let should_hide = if let Some(pool) = app_inner.try_state::<db::DbPool>() {
                    db::queries::get_setting(&pool.0, "close_on_blur")
                        .await
                        .ok()
                        .flatten()
                        .map(|v| v != "false")
                        .unwrap_or(true)
                } else {
                    true
                };
                if should_hide {
                    hide_main_window(&app_inner);
                }
            });
        });
    }
}

fn start_clipboard_monitor(app: tauri::AppHandle) {
    let app_clone = app.clone();

    // Bounded channel: listener only enqueues, worker processes sequentially
    let (tx, mut rx) = tokio::sync::mpsc::channel::<()>(32);

    // Single worker — processes clipboard events one at a time
    let app_worker = app_clone.clone();
    tauri::async_runtime::spawn(async move {
        while rx.recv().await.is_some() {
            handle_clipboard_event(&app_worker).await;
        }
    });

    tauri::async_runtime::spawn(async move {
        // Start the clipboard watcher via the plugin's command
        if let Err(e) = tauri_plugin_clipboard_x::start_listening(app_clone.clone()).await {
            log::error!("Failed to start clipboard listener: {}", e);
            return;
        }
        log::info!("Clipboard monitor started");

        // Listen for clipboard change events — enqueue, never spawn
        app_clone.listen(
            "plugin:clipboard-x://clipboard_changed",
            move |_event: tauri::Event| {
                // try_send: drops event if channel is full (backpressure)
                let _ = tx.try_send(());
            },
        );
    });
}

async fn handle_clipboard_event(app: &tauri::AppHandle) {
    // Skip self-initiated clipboard writes to avoid redundant processing
    if SKIP_NEXT_CLIPBOARD_CHANGE.swap(false, Ordering::SeqCst) {
        log::info!("Skipping self-initiated clipboard change");
        return;
    }

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
                if let Ok(meta) = tokio::fs::metadata(path).await {
                    if clipboard::exceeds_size_limit(meta.len() as usize, max_size_mb) {
                        log::info!("Skipping large file: {} ({}B)", first, meta.len());
                        return None;
                    }
                }

                let file_name = path.file_name().map(|n| n.to_string_lossy().to_string());
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
            if let Ok(img_data) = tokio::fs::read(&img_result.path).await {
                if clipboard::exceeds_size_limit(img_data.len(), max_size_mb) {
                    log::info!("Skipping large image: {}B", img_data.len());
                    return None;
                }
                return Some((ContentType::Image, img_data, None, None, None, None));
            }
        }
    }

    // Try HTML (rich text)
    if let Ok(true) = tauri_plugin_clipboard_x::has_html().await {
        if let Ok(html) = tauri_plugin_clipboard_x::read_html().await {
            let plain = tauri_plugin_clipboard_x::read_text()
                .await
                .unwrap_or_default();
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

    // Try text-based content: link (pure URL) or plain text
    if let Ok(true) = tauri_plugin_clipboard_x::has_text().await {
        if let Ok(text) = tauri_plugin_clipboard_x::read_text().await {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                // Check if it's a pure URL
                if let Ok(parsed) = url::Url::parse(trimmed) {
                    if matches!(parsed.scheme(), "http" | "https") {
                        let content = trimmed.as_bytes().to_vec();
                        return Some((
                            ContentType::Link,
                            content,
                            Some(trimmed.to_string()),
                            None,
                            None,
                            None,
                        ));
                    }
                }
            }
            // Fall through to plain text
            if !text.is_empty() {
                let content = text.as_bytes().to_vec();
                return Some((
                    ContentType::PlainText,
                    content,
                    Some(text),
                    None,
                    None,
                    None,
                ));
            }
        }
    }

    None
}
