use tauri::Manager;

pub fn apply_plugin(
    builder: tauri::Builder<tauri::Wry>,
) -> tauri::Builder<tauri::Wry> {
    builder
}

pub fn init_platform(_app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

pub fn platform_show_window(app: &tauri::AppHandle) {
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

pub fn platform_show_preview(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("preview") {
        let _ = window.show();
    }
}

pub fn platform_hide_preview(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("preview") {
        let _ = window.hide();
    }
}

pub fn platform_resign_before_paste(app: &tauri::AppHandle) {
    platform_hide_window(app);
}

pub fn init_hud_panel(_app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

// CGEvent paste — not available on non-macOS
pub fn check_accessibility_permission() -> bool {
    false
}

pub fn request_accessibility_permission() -> bool {
    false
}

pub fn simulate_paste_cgevent() -> Result<bool, String> {
    Ok(false)
}

// SMAppService autostart — not available on non-macOS
pub fn enable_autostart() -> Result<(), String> {
    Ok(())
}

pub fn disable_autostart() -> Result<(), String> {
    Ok(())
}

pub fn is_autostart_enabled() -> bool {
    false
}

// System appearance — not available on non-macOS
pub fn detect_system_is_light() -> bool {
    false
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
