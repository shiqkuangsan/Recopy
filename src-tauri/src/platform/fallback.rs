use tauri::Manager;

pub fn apply_plugin(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
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
