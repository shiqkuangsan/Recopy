use tauri::{Emitter, Manager};
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt,
};

// Define custom NSPanel class: non-activating, can receive keyboard events
tauri_panel! {
    panel!(RecopyPanel {
        config: {
            is_floating_panel: true,
            can_become_key_window: true,
            can_become_main_window: false,
        }
    })

    panel_event!(RecopyPanelEventHandler {
        window_did_become_key(notification: &NSNotification) -> (),
        window_did_resign_key(notification: &NSNotification) -> (),
    })
}

/// Register the tauri-nspanel plugin on the builder (must happen before .setup())
pub fn apply_plugin(
    builder: tauri::Builder<tauri::Wry>,
) -> tauri::Builder<tauri::Wry> {
    builder.plugin(tauri_nspanel::init())
}

/// Convert the main window to NSPanel and configure it.
/// Must be called in the setup closure after the window is created.
pub fn init_platform(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    // Convert the Tauri window to our custom NSPanel
    let panel = window.to_panel::<RecopyPanel>()?;

    // Float above Dock (level 20), use MainMenu level (24)
    panel.set_level(PanelLevel::MainMenu.value());

    // NonactivatingPanel: clicking the panel does NOT activate the app
    // Keep resizable so the top edge drag handle works for height adjustment.
    // Width is locked via min/max size constraints set in show_main_window().
    panel.set_style_mask(
        StyleMask::empty()
            .nonactivating_panel()
            .resizable()
            .into(),
    );

    // Collection behavior for hidden state:
    // - Stationary: don't participate in Exposé
    // - MoveToActiveSpace: follow user to current Space
    // - FullScreenAuxiliary: can appear alongside fullscreen apps
    // - IgnoresCycle: don't show in Cmd+Tab
    panel.set_collection_behavior(
        CollectionBehavior::new()
            .stationary()
            .move_to_active_space()
            .full_screen_auxiliary()
            .ignores_cycle()
            .into(),
    );

    // We control hiding via blur events, not via app deactivation
    panel.set_hides_on_deactivate(false);

    // Set up event handler to forward focus/blur as Tauri events
    let handler = RecopyPanelEventHandler::new();

    let app_handle = app.handle().clone();
    handler.window_did_become_key(move |_notification| {
        let _ = app_handle.emit("tauri://focus", ());
    });

    let app_handle = app.handle().clone();
    handler.window_did_resign_key(move |_notification| {
        let _ = app_handle.emit("tauri://blur", ());
    });

    panel.set_event_handler(Some(handler.as_ref()));

    log::info!("NSPanel initialized for main window");
    Ok(())
}

/// Show the panel and make it key window.
pub fn platform_show_window(app: &tauri::AppHandle) {
    if let Ok(panel) = app.get_webview_panel("main") {
        // When showing: join all spaces so panel appears on current Space
        panel.set_collection_behavior(
            CollectionBehavior::new()
                .can_join_all_spaces()
                .stationary()
                .full_screen_auxiliary()
                .ignores_cycle()
                .into(),
        );

        panel.show_and_make_key();
    }
}

/// Hide the panel.
/// Safe to call from any thread — dispatches to main thread.
pub fn platform_hide_window(app: &tauri::AppHandle) {
    let app_inner = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Ok(panel) = app_inner.get_webview_panel("main") {
            panel.hide();

            // When hidden: move to active space for next show
            panel.set_collection_behavior(
                CollectionBehavior::new()
                    .move_to_active_space()
                    .stationary()
                    .full_screen_auxiliary()
                    .ignores_cycle()
                    .into(),
            );
        }
    });
}

/// Check if the panel is currently visible.
pub fn platform_is_visible(app: &tauri::AppHandle) -> bool {
    app.get_webview_panel("main")
        .map(|panel| panel.is_visible())
        .unwrap_or(false)
}

/// Initialize the HUD window as NSPanel (non-activating).
pub fn init_hud_panel(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let Some(window) = app.get_webview_window("hud") else {
        log::warn!("HUD window not found, skipping panel init");
        return Ok(());
    };

    let panel = window.to_panel::<RecopyPanel>()?;

    // Float above the main panel
    panel.set_level(PanelLevel::MainMenu.value() + 1);

    // Non-activating: clicking the HUD doesn't activate the app
    panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());

    panel.set_collection_behavior(
        CollectionBehavior::new()
            .stationary()
            .can_join_all_spaces()
            .full_screen_auxiliary()
            .ignores_cycle()
            .into(),
    );

    panel.set_hides_on_deactivate(false);

    log::info!("NSPanel initialized for HUD window");
    Ok(())
}

/// Show the HUD panel without making it key (non-focus-stealing).
pub fn platform_show_hud(app: &tauri::AppHandle) {
    if let Ok(panel) = app.get_webview_panel("hud") {
        panel.show();
    }
}

/// Hide the HUD panel.
pub fn platform_hide_hud(app: &tauri::AppHandle) {
    let app_inner = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Ok(panel) = app_inner.get_webview_panel("hud") {
            panel.hide();
        }
    });
}

/// Resign key window status without hiding.
/// This returns keyboard focus to the previously active app
/// so that simulate_paste() sends Cmd+V to the correct target.
/// Blocks until the main thread completes the operation.
pub fn platform_resign_before_paste(app: &tauri::AppHandle) {
    let (tx, rx) = std::sync::mpsc::sync_channel::<()>(0);
    let app_inner = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Ok(panel) = app_inner.get_webview_panel("main") {
            panel.resign_key_window();
        }
        let _ = tx.send(());
    });
    // Wait for main thread to complete — ensures focus is resigned before simulate_paste()
    let _ = rx.recv();
}
