use crate::db::{
    models::{ClipboardItem, ContentType, NewClipboardItem},
    queries, DbPool,
};
use crate::clipboard as clip_util;
use tauri::{AppHandle, Manager, State};
use std::process::Command;

/// Get clipboard items with optional filters.
#[tauri::command]
pub async fn get_clipboard_items(
    db: State<'_, DbPool>,
    content_type: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<ClipboardItem>, String> {
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);
    let ct = content_type.as_deref();

    queries::get_items(&db.0, ct, limit, offset)
        .await
        .map_err(|e| e.to_string())
}

/// Search clipboard items.
#[tauri::command]
pub async fn search_clipboard_items(
    db: State<'_, DbPool>,
    query: String,
    content_type: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<ClipboardItem>, String> {
    let limit = limit.unwrap_or(50);
    let ct = content_type.as_deref();

    queries::search_items(&db.0, &query, ct, limit)
        .await
        .map_err(|e| e.to_string())
}

/// Delete a clipboard item.
#[tauri::command]
pub async fn delete_clipboard_item(
    db: State<'_, DbPool>,
    id: String,
) -> Result<(), String> {
    queries::delete_item(&db.0, &id)
        .await
        .map_err(|e| e.to_string())
}

/// Paste a clipboard item: write to system clipboard, optionally simulate Cmd+V.
#[tauri::command]
pub async fn paste_clipboard_item(
    app: AppHandle,
    db: State<'_, DbPool>,
    id: String,
    auto_paste: Option<bool>,
) -> Result<(), String> {
    let row = queries::get_item_by_id(&db.0, &id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Item not found")?;

    let (content_type, plain_text, rich_content, image_path, file_path) = row;

    write_to_clipboard(&app, &content_type, &plain_text, &rich_content, &image_path, &file_path).await?;

    if auto_paste.unwrap_or(true) {
        // Resign keyboard focus so the previous app receives the Cmd+V
        crate::platform::platform_resign_before_paste(&app);
        simulate_paste();
        // Now hide the panel
        crate::platform::platform_hide_window(&app);
    }

    Ok(())
}

/// Paste as plain text only (strip rich formatting).
#[tauri::command]
pub async fn paste_as_plain_text(
    app: AppHandle,
    db: State<'_, DbPool>,
    id: String,
) -> Result<(), String> {
    let row = queries::get_item_by_id(&db.0, &id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Item not found")?;

    let (_content_type, plain_text, _rich_content, _image_path, _file_path) = row;

    // Write only plain text
    tauri_plugin_clipboard_x::write_text(plain_text)
        .await
        .map_err(|e| format!("Failed to write text: {}", e))?;

    // Resign keyboard focus so the previous app receives the Cmd+V
    crate::platform::platform_resign_before_paste(&app);
    simulate_paste();
    // Now hide the panel
    crate::platform::platform_hide_window(&app);
    Ok(())
}

/// Toggle favorite status of a clipboard item.
#[tauri::command]
pub async fn toggle_favorite(
    db: State<'_, DbPool>,
    id: String,
) -> Result<bool, String> {
    let current: (bool,) = sqlx::query_as(
        "SELECT is_favorited FROM clipboard_items WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&db.0)
    .await
    .map_err(|e| e.to_string())?;

    let new_val = !current.0;
    sqlx::query("UPDATE clipboard_items SET is_favorited = ? WHERE id = ?")
        .bind(new_val)
        .bind(&id)
        .execute(&db.0)
        .await
        .map_err(|e| e.to_string())?;

    Ok(new_val)
}

/// Write content to system clipboard based on type.
async fn write_to_clipboard(
    _app: &AppHandle,
    content_type: &str,
    plain_text: &str,
    rich_content: &Option<Vec<u8>>,
    image_path: &Option<String>,
    file_path: &Option<String>,
) -> Result<(), String> {
    match content_type {
        "image" => {
            if let Some(path) = image_path {
                let file_size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
                log::info!("Pasting image from path: {} ({}B)", path, file_size);
                tauri_plugin_clipboard_x::write_image(path.clone())
                    .await
                    .map_err(|e| format!("Failed to write image: {}", e))?;
            } else {
                log::warn!("Paste image: image_path is None!");
            }
        }
        "file" => {
            if let Some(path) = file_path {
                tauri_plugin_clipboard_x::write_files(vec![path.clone()])
                    .await
                    .map_err(|e| format!("Failed to write files: {}", e))?;
            }
        }
        "rich_text" => {
            if let Some(html_bytes) = rich_content {
                let html = String::from_utf8_lossy(html_bytes).to_string();
                // write_html(text, html) — first arg is plain text fallback, second is HTML
                tauri_plugin_clipboard_x::write_html(plain_text.to_string(), html)
                    .await
                    .map_err(|e| format!("Failed to write HTML: {}", e))?;
            } else {
                tauri_plugin_clipboard_x::write_text(plain_text.to_string())
                    .await
                    .map_err(|e| format!("Failed to write text: {}", e))?;
            }
        }
        _ => {
            tauri_plugin_clipboard_x::write_text(plain_text.to_string())
                .await
                .map_err(|e| format!("Failed to write text: {}", e))?;
        }
    }
    Ok(())
}

/// Simulate Cmd+V paste via osascript on macOS.
fn simulate_paste() {
    #[cfg(target_os = "macos")]
    {
        // Small delay to let clipboard settle
        std::thread::sleep(std::time::Duration::from_millis(50));
        let _ = Command::new("osascript")
            .arg("-e")
            .arg("tell application \"System Events\" to keystroke \"v\" using command down")
            .output();
    }
}

/// Get favorited items, optionally filtered by content type.
#[tauri::command]
pub async fn get_favorited_items(
    db: State<'_, DbPool>,
    content_type: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<ClipboardItem>, String> {
    queries::get_favorited_items(&db.0, content_type.as_deref(), limit.unwrap_or(200), offset.unwrap_or(0))
        .await
        .map_err(|e| e.to_string())
}

// ---- Settings commands ----

/// Get all settings.
#[tauri::command]
pub async fn get_settings(
    db: State<'_, DbPool>,
) -> Result<serde_json::Value, String> {
    let settings = queries::get_all_settings(&db.0)
        .await
        .map_err(|e| e.to_string())?;

    let mut map = serde_json::Map::new();
    for (key, value) in settings {
        map.insert(key, serde_json::Value::String(value));
    }
    Ok(serde_json::Value::Object(map))
}

/// Get a single setting value.
#[tauri::command]
pub async fn get_setting(
    db: State<'_, DbPool>,
    key: String,
) -> Result<Option<String>, String> {
    queries::get_setting(&db.0, &key)
        .await
        .map_err(|e| e.to_string())
}

/// Set a setting value.
#[tauri::command]
pub async fn set_setting(
    db: State<'_, DbPool>,
    key: String,
    value: String,
) -> Result<(), String> {
    queries::set_setting(&db.0, &key, &value)
        .await
        .map_err(|e| e.to_string())
}

/// Clear all clipboard history (preserve favorites).
#[tauri::command]
pub async fn clear_history(
    db: State<'_, DbPool>,
) -> Result<i64, String> {
    queries::clear_history(&db.0)
        .await
        .map_err(|e| e.to_string())
}

/// Run retention cleanup based on current settings.
#[tauri::command]
pub async fn run_retention_cleanup(
    db: State<'_, DbPool>,
) -> Result<i64, String> {
    let policy = queries::get_setting(&db.0, "retention_policy")
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "unlimited".to_string());

    let days = queries::get_setting(&db.0, "retention_days")
        .await
        .map_err(|e| e.to_string())?
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);

    let count = queries::get_setting(&db.0, "retention_count")
        .await
        .map_err(|e| e.to_string())?
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);

    queries::cleanup_by_retention(&db.0, &policy, days, count)
        .await
        .map_err(|e| e.to_string())
}

/// Hide the main window (works with NSPanel on macOS).
#[tauri::command]
pub fn hide_window(app: AppHandle) {
    crate::platform::platform_hide_window(&app);
}

/// Open the settings window.
#[tauri::command]
pub async fn open_settings_window(app: AppHandle) -> Result<(), String> {
    // If settings window already exists, just show it
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    let url = tauri::WebviewUrl::App("index.html?page=settings".into());
    tauri::WebviewWindowBuilder::new(&app, "settings", url)
        .title("EasyCV Settings")
        .inner_size(560.0, 480.0)
        .resizable(false)
        .center()
        .build()
        .map_err(|e| format!("Failed to open settings window: {}", e))?;

    Ok(())
}

/// Process and store a new clipboard entry from the monitoring system.
/// Called internally, not directly from frontend.
pub async fn process_clipboard_change(
    app: &AppHandle,
    content_type: ContentType,
    content: Vec<u8>,
    plain_text: Option<String>,
    rich_content: Option<Vec<u8>>,
    file_path: Option<String>,
    file_name: Option<String>,
    source_app: String,
    source_app_name: String,
) -> Result<Option<String>, String> {
    // Size check
    if clip_util::exceeds_size_limit(content.len()) {
        log::info!("Clipboard content exceeds size limit ({}B), skipping", content.len());
        return Ok(None);
    }

    // Compute hash for dedup
    let hash = clip_util::compute_hash(&content);

    let db = app.state::<DbPool>();

    // Dedup check
    if let Some(existing_id) = queries::find_and_bump_by_hash(&db.0, &hash)
        .await
        .map_err(|e| e.to_string())?
    {
        log::info!("Duplicate content detected, bumped item {}", existing_id);
        return Ok(Some(existing_id));
    }

    // Process image: generate thumbnail and save original
    let (thumbnail, image_path) = if content_type == ContentType::Image {
        let thumb = clip_util::generate_thumbnail(&content).ok();
        let app_data = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?;
        let path = clip_util::save_original_image(&app_data, &content, "png").ok();
        (thumb, path)
    } else {
        (None, None)
    };

    let new_item = NewClipboardItem {
        content_type,
        plain_text: plain_text.unwrap_or_default(),
        rich_content,
        thumbnail,
        image_path,
        file_path,
        file_name,
        source_app,
        source_app_name,
        content_size: content.len() as i64,
        content_hash: hash,
    };

    let id = queries::insert_item(&db.0, &new_item)
        .await
        .map_err(|e| e.to_string())?;

    log::info!("New clipboard item stored: {} ({})", id, new_item.content_type.as_str());
    Ok(Some(id))
}
