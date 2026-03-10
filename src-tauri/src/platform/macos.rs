use objc2::MainThreadMarker;
use tauri::{Emitter, Manager};

use super::nspanel::{
    self, CollectionBehavior, EventHandler, PanelExt, PanelLevel, PanelType, StyleMask,
};

/// Convert the main window to NSPanel and configure it.
/// Must be called in the setup closure after the window is created.
pub fn init_platform(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    // Set up event handler to forward focus/blur as Tauri events
    let handler = EventHandler::new();

    let app_handle = app.handle().clone();
    handler.set_on_become_key(move || {
        let _ = app_handle.emit("tauri://focus", ());
    });

    let app_handle = app.handle().clone();
    handler.set_on_resign_key(move || {
        let _ = app_handle.emit("tauri://blur", ());
    });

    // Convert the Tauri window to our custom NSPanel
    let panel = nspanel::convert_to_panel(app.handle(), &window, PanelType::Recopy, Some(handler))?;

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

    log::info!("NSPanel initialized for main window");
    Ok(())
}

/// Show the panel and make it key window.
/// Safe to call from any thread — dispatches to main thread.
/// `panel_position` controls the window level: "top" uses MainMenu+1 to overlay
/// the macOS menu bar; other positions use MainMenu level (below menu bar).
pub fn platform_show_window(app: &tauri::AppHandle, panel_position: &str) {
    let app_inner = app.clone();
    let is_top = panel_position == "top";
    let _ = app.run_on_main_thread(move || {
        if let Ok(panel) = app_inner.get_panel("main") {
            // Adjust level: top mode overlays menu bar (level 25), others stay below (level 24)
            let level = if is_top {
                PanelLevel::MainMenu.value() + 1
            } else {
                PanelLevel::MainMenu.value()
            };
            panel.set_level(level);

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
    });
}

/// Hide the panel.
/// Safe to call from any thread — dispatches to main thread.
pub fn platform_hide_window(app: &tauri::AppHandle) {
    let app_inner = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Ok(panel) = app_inner.get_panel("main") {
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
/// Safe to call from any thread — dispatches to main thread if needed.
pub fn platform_is_visible(app: &tauri::AppHandle) -> bool {
    // Fast path: already on main thread, call directly (avoids sync_channel deadlock)
    if MainThreadMarker::new().is_some() {
        return app
            .get_panel("main")
            .map(|panel| panel.is_visible())
            .unwrap_or(false);
    }
    // Off main thread: dispatch synchronously
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    let app_inner = app.clone();
    let _ = app.run_on_main_thread(move || {
        let visible = app_inner
            .get_panel("main")
            .map(|panel| panel.is_visible())
            .unwrap_or(false);
        let _ = tx.send(visible);
    });
    rx.recv().unwrap_or(false)
}

/// Initialize the HUD window as NSPanel (non-activating).
pub fn init_hud_panel(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let Some(window) = app.get_webview_window("hud") else {
        log::warn!("HUD window not found, skipping panel init");
        return Ok(());
    };

    let panel = nspanel::convert_to_panel(app.handle(), &window, PanelType::Recopy, None)?;

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
/// Safe to call from any thread — dispatches to main thread.
pub fn platform_show_hud(app: &tauri::AppHandle) {
    let app_inner = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Ok(panel) = app_inner.get_panel("hud") {
            panel.show();
        }
    });
}

/// Hide the HUD panel.
pub fn platform_hide_hud(app: &tauri::AppHandle) {
    let app_inner = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Ok(panel) = app_inner.get_panel("hud") {
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

    let panel = nspanel::convert_to_panel(app.handle(), &window, PanelType::Preview, None)?;

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
        if let Ok(panel) = app_inner.get_panel("preview") {
            panel.show();
        }
    });
}

/// Hide the preview panel.
pub fn platform_hide_preview(app: &tauri::AppHandle) {
    let app_inner = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Ok(panel) = app_inner.get_panel("preview") {
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

// No-ops on macOS: NSPanel is non-activating, so preview never steals focus.
// Called via `platform::*` re-export in lib.rs; compiler cannot trace glob re-exports.
#[allow(dead_code)]
pub fn is_preview_focus_guard() -> bool {
    false
}
#[allow(dead_code)]
pub fn set_preview_focus_guard(_val: bool) {}
#[allow(dead_code)]
pub fn take_preview_programmatic_hide() -> bool {
    false
}

#[allow(dead_code)]
pub fn on_window_focused() {}

#[allow(dead_code)]
pub fn is_recopy_foreground() -> bool {
    false
}

/// Detect which monitor contains the mouse cursor and return its bounds.
/// Returns (x, y, width, height) in logical coordinates (CG points, top-left origin).
/// Used by show_main_window() to position the panel on the correct monitor.
pub fn platform_cursor_monitor() -> Option<(f64, f64, f64, f64)> {
    use std::ffi::c_void;

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct CGPoint {
        x: f64,
        y: f64,
    }

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct CGSize {
        width: f64,
        height: f64,
    }

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct CGRect {
        origin: CGPoint,
        size: CGSize,
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventCreate(source: *const c_void) -> *mut c_void;
        fn CGEventGetLocation(event: *const c_void) -> CGPoint;
        fn CGGetActiveDisplayList(max: u32, list: *mut u32, count: *mut u32) -> i32;
        fn CGDisplayBounds(display: u32) -> CGRect;
    }

    extern "C" {
        fn CFRelease(cf: *const c_void);
    }

    unsafe {
        // Get cursor position in CG global coordinates (points, top-left origin)
        let event = CGEventCreate(std::ptr::null());
        if event.is_null() {
            return None;
        }
        let cursor = CGEventGetLocation(event);
        CFRelease(event);

        // Enumerate active displays
        let mut count: u32 = 0;
        if CGGetActiveDisplayList(0, std::ptr::null_mut(), &mut count) != 0 || count == 0 {
            return None;
        }
        let mut displays = vec![0u32; count as usize];
        if CGGetActiveDisplayList(count, displays.as_mut_ptr(), &mut count) != 0 {
            return None;
        }

        // Find which display contains the cursor
        for &display in &displays {
            let bounds = CGDisplayBounds(display);
            if cursor.x >= bounds.origin.x
                && cursor.x < bounds.origin.x + bounds.size.width
                && cursor.y >= bounds.origin.y
                && cursor.y < bounds.origin.y + bounds.size.height
            {
                return Some((
                    bounds.origin.x,
                    bounds.origin.y,
                    bounds.size.width,
                    bounds.size.height,
                ));
            }
        }

        // Cursor not in any display (e.g. display hotplug) — let caller fall back
        None
    }
}

/// Get the system menu bar height (accounts for notched Mac displays).
/// Uses `[[NSApp mainMenu] menuBarHeight]` via raw objc_msgSend.
pub fn platform_menu_bar_height() -> f64 {
    use std::ffi::{c_char, c_void};

    extern "C" {
        fn objc_getClass(name: *const c_char) -> *mut c_void;
        fn sel_registerName(name: *const c_char) -> *mut c_void;
        fn objc_msgSend();
    }

    unsafe {
        let msg_ptr: unsafe extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as *const ());
        let msg_f64: unsafe extern "C" fn(*mut c_void, *mut c_void) -> f64 =
            std::mem::transmute(objc_msgSend as *const ());

        // [NSApplication sharedApplication]
        let cls = objc_getClass(b"NSApplication\0".as_ptr() as _);
        let sel = sel_registerName(b"sharedApplication\0".as_ptr() as _);
        let app = msg_ptr(cls, sel);
        if app.is_null() {
            return 25.0;
        }

        // [app mainMenu]
        let sel = sel_registerName(b"mainMenu\0".as_ptr() as _);
        let menu = msg_ptr(app, sel);
        if menu.is_null() {
            return 25.0;
        }

        // [menu menuBarHeight]
        let sel = sel_registerName(b"menuBarHeight\0".as_ptr() as _);
        let height = msg_f64(menu, sel);

        if height > 0.0 {
            height
        } else {
            25.0
        }
    }
}

/// Resign key window status without hiding.
/// This returns keyboard focus to the previously active app
/// so that simulate_paste() sends Cmd+V to the correct target.
/// Blocks until the main thread completes the operation.
pub fn platform_resign_before_paste(app: &tauri::AppHandle) {
    let (tx, rx) = std::sync::mpsc::sync_channel::<()>(0);
    let app_inner = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Ok(panel) = app_inner.get_panel("main") {
            panel.resign_key_window();
        }
        let _ = tx.send(());
    });
    // Wait for main thread to complete — ensures focus is resigned before simulate_paste()
    let _ = rx.recv();
}
