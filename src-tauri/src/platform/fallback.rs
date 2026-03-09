use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

/// Set when preview is being shown (regular window.show() steals focus on Windows).
/// Prevents main's blur handler from hiding while preview opens.
static PREVIEW_FOCUS_GUARD: AtomicBool = AtomicBool::new(false);

/// Set before programmatically hiding the preview window.
/// Prevents the preview blur handler from triggering close-all on explicit close.
/// Named distinctly from `PreviewClosing` (Tauri managed state for CSS exit animation).
static PREVIEW_PROGRAMMATIC_HIDE: AtomicBool = AtomicBool::new(false);
pub fn init_platform(_app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

pub fn platform_show_window(app: &tauri::AppHandle, _panel_position: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn platform_hide_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

pub fn platform_is_visible(app: &tauri::AppHandle) -> bool {
    app.get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false)
}

pub fn init_preview_panel(_app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

/// Show the preview window.
/// Sets PREVIEW_FOCUS_GUARD before show so main's blur handler skips hiding.
/// On Windows, show() steals focus, so we immediately return focus to main
/// to emulate macOS NSPanel non-activating behavior (keyboard stays on main).
pub fn platform_show_preview(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("preview") {
        PREVIEW_FOCUS_GUARD.store(true, Ordering::SeqCst);
        let _ = window.show();
        // Give focus back to main so Space/Escape still handled by main webview
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.set_focus();
        }
    }
}

/// Hide the preview window.
/// Only sets PREVIEW_PROGRAMMATIC_HIDE when we actually have a window to hide,
/// avoiding a stuck flag if the window was destroyed or never created.
pub fn platform_hide_preview(app: &tauri::AppHandle) {
    PREVIEW_FOCUS_GUARD.store(false, Ordering::SeqCst);
    if let Some(window) = app.get_webview_window("preview") {
        PREVIEW_PROGRAMMATIC_HIDE.store(true, Ordering::SeqCst);
        let _ = window.hide();
    }
}

/// True if preview is currently opening and has stolen focus from main.
pub fn is_preview_focus_guard() -> bool {
    PREVIEW_FOCUS_GUARD.load(Ordering::SeqCst)
}

/// Clear the focus guard once preview has fully received focus.
pub fn set_preview_focus_guard(val: bool) {
    PREVIEW_FOCUS_GUARD.store(val, Ordering::SeqCst);
}

/// Consume the programmatic-hide flag: returns true (and resets to false) if an explicit hide is in flight.
pub fn take_preview_programmatic_hide() -> bool {
    PREVIEW_PROGRAMMATIC_HIDE.swap(false, Ordering::SeqCst)
}

pub fn platform_resign_before_paste(app: &tauri::AppHandle) {
    platform_hide_window(app);
}

pub fn on_window_focused() {}

#[allow(dead_code)]
pub fn is_recopy_foreground() -> bool {
    false
}

pub fn init_hud_panel(_app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

pub fn platform_show_hud(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("hud") {
        let _ = window.show();
    }
}

pub fn platform_hide_hud(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("hud") {
        let _ = window.hide();
    }
}
