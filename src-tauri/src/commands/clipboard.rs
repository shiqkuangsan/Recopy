use crate::db::{
    models::{ClipboardItem, ContentType, NewClipboardItem},
    queries, DbPool,
};
use crate::clipboard as clip_util;
use tauri::{AppHandle, Emitter, Manager, State};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

static HUD_GENERATION: AtomicU64 = AtomicU64::new(0);

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

/// Get the thumbnail for a single clipboard item (lazy loading).
#[tauri::command]
pub async fn get_thumbnail(
    db: State<'_, DbPool>,
    id: String,
) -> Result<Option<Vec<u8>>, String> {
    queries::get_thumbnail(&db.0, &id)
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

/// Unregister the current global shortcut (used during shortcut recording).
#[tauri::command]
pub async fn unregister_shortcut(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    app.global_shortcut().unregister_all().map_err(|e| e.to_string())
}

/// Re-register the global shortcut from DB settings.
#[tauri::command]
pub async fn register_shortcut(app: AppHandle, db: State<'_, DbPool>) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    let shortcut = queries::get_setting(&db.0, "shortcut")
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "CommandOrControl+Shift+V".to_string());

    // Unregister all existing shortcuts before registering new one
    app.global_shortcut().unregister_all().map_err(|e| e.to_string())?;

    let app_handle = app.clone();
    app.global_shortcut()
        .on_shortcut(shortcut.as_str(), move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if crate::platform::platform_is_visible(&app_handle) {
                    crate::hide_main_window(&app_handle);
                } else {
                    crate::show_main_window(&app_handle);
                }
            }
        })
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

/// Show copy HUD: hide main window, display a centered HUD briefly.
#[tauri::command]
pub fn show_copy_hud(app: AppHandle) {
    // Hide main window first
    crate::platform::platform_hide_window(&app);

    // Position HUD at screen center
    if let Some(hud) = app.get_webview_window("hud") {
        if let Ok(Some(monitor)) = hud.current_monitor() {
            let size = monitor.size();
            let pos = monitor.position();
            let scale = monitor.scale_factor();
            let screen_w = size.width as f64 / scale;
            let screen_h = size.height as f64 / scale;
            let hud_w = 140.0;
            let hud_h = 140.0;
            let x = pos.x as f64 / scale + (screen_w - hud_w) / 2.0;
            let y = pos.y as f64 / scale + (screen_h - hud_h) / 2.0;
            let _ = hud.set_position(tauri::Position::Logical(
                tauri::LogicalPosition::new(x, y),
            ));
        }
    }

    // Show HUD panel (non-activating on macOS)
    crate::platform::platform_show_hud(&app);

    // Auto-hide after 800ms (generation counter prevents stale timers)
    let gen = HUD_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let app_clone = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(800));
        if HUD_GENERATION.load(Ordering::SeqCst) == gen {
            crate::platform::platform_hide_hud(&app_clone);
        }
    });
}

/// Open the settings window.
#[tauri::command]
pub async fn open_settings_window(app: AppHandle) -> Result<(), String> {
    crate::open_settings_window_impl(&app);
    Ok(())
}

/// Check if a file path has an image extension.
fn is_image_file(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".gif")
        || lower.ends_with(".webp")
        || lower.ends_with(".bmp")
        || lower.ends_with(".tiff")
        || lower.ends_with(".tif")
        || lower.ends_with(".ico")
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
    let db = app.state::<DbPool>();

    // Size check with dynamic limit from settings
    let max_size_mb = queries::get_setting(&db.0, "max_item_size_mb")
        .await
        .unwrap_or(None)
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(clip_util::DEFAULT_MAX_ITEM_SIZE_MB);
    if clip_util::exceeds_size_limit(content.len(), max_size_mb) {
        log::info!("Clipboard content exceeds size limit ({}B > {}MB), skipping", content.len(), max_size_mb);
        return Ok(None);
    }

    // Compute hash for dedup
    let hash = clip_util::compute_hash(&content);

    // Dedup check
    if let Some(existing_id) = queries::find_and_bump_by_hash(&db.0, &hash)
        .await
        .map_err(|e| e.to_string())?
    {
        log::info!("Duplicate content detected, bumped item {}", existing_id);
        return Ok(Some(existing_id));
    }

    // Process image: generate thumbnail and save original
    // Note: For file-type images, thumbnail is generated asynchronously after insert (see below)
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

    // For file items, use the actual file size instead of the path string length
    let content_size = if content_type == ContentType::File {
        file_path
            .as_ref()
            .and_then(|fp| std::fs::metadata(fp).ok())
            .map(|m| m.len() as i64)
            .unwrap_or(content.len() as i64)
    } else {
        content.len() as i64
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
        content_size,
        content_hash: hash,
    };

    let id = queries::insert_item(&db.0, &new_item)
        .await
        .map_err(|e| e.to_string())?;

    log::info!("New clipboard item stored: {} ({})", id, new_item.content_type.as_str());

    // Background: generate thumbnail for image files (non-blocking)
    if new_item.content_type == ContentType::File {
        if let Some(ref fp) = new_item.file_path {
            if is_image_file(fp) {
                let pool = db.0.clone();
                let id_clone = id.clone();
                let fp_clone = fp.clone();
                let app_clone = app.clone();
                tauri::async_runtime::spawn(async move {
                    let data = match tokio::fs::read(&fp_clone).await {
                        Ok(d) => d,
                        Err(e) => {
                            log::warn!("Failed to read image file for thumbnail: {}", e);
                            return;
                        }
                    };
                    let thumb = match tokio::task::spawn_blocking(move || {
                        clip_util::generate_thumbnail(&data)
                    })
                    .await
                    {
                        Ok(Ok(t)) => t,
                        _ => {
                            log::warn!("Failed to generate thumbnail for file");
                            return;
                        }
                    };
                    if let Err(e) = queries::update_thumbnail(&pool, &id_clone, &thumb).await {
                        log::warn!("Failed to update thumbnail: {}", e);
                        return;
                    }
                    // Notify frontend to refresh with the new thumbnail
                    let _ = app_clone.emit(
                        "clipboard-changed",
                        serde_json::json!({ "id": id_clone }),
                    );
                    log::info!("Thumbnail generated for file item: {}", id_clone);
                });
            }
        }
    }

    Ok(Some(id))
}
