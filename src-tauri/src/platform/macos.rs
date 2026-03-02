// The tauri_panel! macro generates `-> ()` signatures that trigger clippy::unused_unit.
#![allow(clippy::unused_unit)]

use tauri::{Emitter, Manager};
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt,
};

// Define custom NSPanel classes.
// RecopyPanel: non-activating, can receive keyboard events (main window + HUD).
// PreviewPanel: non-activating, does NOT become key (won't steal focus from main panel).
tauri_panel! {
    panel!(RecopyPanel {
        config: {
            is_floating_panel: true,
            can_become_key_window: true,
            can_become_main_window: false,
        }
    })

    panel!(PreviewPanel {
        config: {
            is_floating_panel: true,
            can_become_key_window: false,
            can_become_main_window: false,
        }
    })

    panel_event!(RecopyPanelEventHandler {
        window_did_become_key(notification: &NSNotification) -> (),
        window_did_resign_key(notification: &NSNotification) -> (),
    })
}

/// Register the tauri-nspanel plugin on the builder (must happen before .setup())
pub fn apply_plugin(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
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
    panel.set_style_mask(StyleMask::empty().nonactivating_panel().resizable().into());

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

/// Initialize the preview window as NSPanel (non-activating, no key window).
pub fn init_preview_panel(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let Some(window) = app.get_webview_window("preview") else {
        log::warn!("Preview window not found, skipping panel init");
        return Ok(());
    };

    let panel = window.to_panel::<PreviewPanel>()?;

    // Float above the main panel
    panel.set_level(PanelLevel::MainMenu.value() + 1);

    // Non-activating: clicking the preview doesn't activate the app
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

    log::info!("NSPanel initialized for preview window");
    Ok(())
}

/// Show the preview panel without making it key (non-focus-stealing).
/// Fire-and-forget: dispatches to main thread without blocking.
pub fn platform_show_preview(app: &tauri::AppHandle) {
    let app_inner = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Ok(panel) = app_inner.get_webview_panel("preview") {
            panel.show();
        }
    });
}

/// Hide the preview panel.
pub fn platform_hide_preview(app: &tauri::AppHandle) {
    let app_inner = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Ok(panel) = app_inner.get_webview_panel("preview") {
            panel.hide();
        }
    });
}

/// Write raw image bytes directly to NSPasteboard, bypassing decode→encode cycle.
/// Reads the PNG file from disk and writes it directly as NSPasteboardTypePNG.
pub fn platform_write_image_to_pasteboard(path: &str) -> Result<(), String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Failed to read image file: {}", e))?;

    use objc2::runtime::ProtocolObject;
    use objc2_app_kit::{NSPasteboard, NSPasteboardItem, NSPasteboardTypePNG, NSPasteboardWriting};
    use objc2_foundation::{NSArray, NSData};

    unsafe {
        let pasteboard = NSPasteboard::generalPasteboard();
        pasteboard.clearContents();

        let ns_data = NSData::with_bytes(&bytes);
        let item = NSPasteboardItem::new();
        let set_ok = item.setData_forType(&ns_data, NSPasteboardTypePNG);
        if !set_ok {
            return Err("Failed to set pasteboard item data".to_string());
        }

        let proto_item: objc2::rc::Retained<ProtocolObject<dyn NSPasteboardWriting>> =
            ProtocolObject::from_retained(item);
        let items = NSArray::from_retained_slice(&[proto_item]);
        if !pasteboard.writeObjects(&items) {
            return Err("NSPasteboard writeObjects failed".to_string());
        }
    }

    Ok(())
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
