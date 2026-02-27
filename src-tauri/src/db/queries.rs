use sqlx::SqlitePool;
use uuid::Uuid;

use super::models::{ClipboardItem, NewClipboardItem};

/// Insert a new clipboard item and sync FTS index (transactional).
pub async fn insert_item(pool: &SqlitePool, item: &NewClipboardItem) -> Result<String, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO clipboard_items (id, content_type, plain_text, rich_content, thumbnail, image_path, file_path, file_name, source_app, source_app_name, content_size, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(item.content_type.as_str())
    .bind(&item.plain_text)
    .bind(&item.rich_content)
    .bind(&item.thumbnail)
    .bind(&item.image_path)
    .bind(&item.file_path)
    .bind(item.file_name.as_deref().unwrap_or(""))
    .bind(&item.source_app)
    .bind(&item.source_app_name)
    .bind(item.content_size)
    .bind(&item.content_hash)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO clipboard_fts (item_id, plain_text, file_name, source_app_name) VALUES (?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&item.plain_text)
    .bind(item.file_name.as_deref().unwrap_or(""))
    .bind(&item.source_app_name)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(id)
}

/// Check if a clipboard item with the given hash already exists.
/// If so, bump its updated_at and return its id.
pub async fn find_and_bump_by_hash(pool: &SqlitePool, hash: &str) -> Result<Option<String>, sqlx::Error> {
    let row: Option<(String,)> = sqlx::query_as(
        "UPDATE clipboard_items SET updated_at = datetime('now') WHERE content_hash = ? RETURNING id",
    )
    .bind(hash)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(id,)| id))
}

/// Get clipboard items with optional type filter, ordered by updated_at desc.
/// Excludes thumbnail blobs for fast IPC transfer.
pub async fn get_items(
    pool: &SqlitePool,
    content_type: Option<&str>,
    limit: i64,
    offset: i64,
) -> Result<Vec<ClipboardItem>, sqlx::Error> {
    let items = if let Some(ct) = content_type {
        sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, Option<String>, String, String, i64, String, bool, String, String)>(
            "SELECT id, content_type, plain_text, image_path, file_path, file_name, source_app, source_app_name, content_size, content_hash, is_favorited, created_at, updated_at
             FROM clipboard_items WHERE content_type = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
        )
        .bind(ct)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, Option<String>, String, String, i64, String, bool, String, String)>(
            "SELECT id, content_type, plain_text, image_path, file_path, file_name, source_app, source_app_name, content_size, content_hash, is_favorited, created_at, updated_at
             FROM clipboard_items ORDER BY updated_at DESC LIMIT ? OFFSET ?",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?
    };

    Ok(items
        .into_iter()
        .map(|r| ClipboardItem {
            id: r.0,
            content_type: r.1,
            plain_text: r.2,
            thumbnail: None,
            image_path: r.3,
            file_path: r.4,
            file_name: r.5,
            source_app: r.6,
            source_app_name: r.7,
            content_size: r.8,
            content_hash: r.9,
            is_favorited: r.10,
            created_at: r.11,
            updated_at: r.12,
        })
        .collect())
}

/// Get a single clipboard item by id.
pub async fn get_item_by_id(pool: &SqlitePool, id: &str) -> Result<Option<(String, String, Option<Vec<u8>>, Option<String>, Option<String>)>, sqlx::Error> {
    sqlx::query_as(
        "SELECT content_type, plain_text, rich_content, image_path, file_path FROM clipboard_items WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

/// Get full item detail for preview (includes rich_content as UTF-8 string).
pub async fn get_item_detail(
    pool: &SqlitePool,
    id: &str,
) -> Result<Option<(String, String, Option<String>, Option<String>, Option<String>, Option<String>, i64)>, sqlx::Error> {
    // Query rich_content as raw bytes, then convert in the caller
    let row: Option<(String, String, Option<Vec<u8>>, Option<String>, Option<String>, Option<String>, i64)> = sqlx::query_as(
        "SELECT content_type, plain_text, rich_content, image_path, file_path, file_name, content_size
         FROM clipboard_items WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(ct, pt, rc, ip, fp, fn_, cs)| {
        let rich_str = rc.map(|bytes| String::from_utf8_lossy(&bytes).to_string());
        (ct, pt, rich_str, ip, fp, fn_, cs)
    }))
}

/// Return the image_path of a single item (None if not an image or not found).
pub async fn get_image_path_by_id(pool: &SqlitePool, id: &str) -> Result<Option<String>, sqlx::Error> {
    let row: Option<(Option<String>,)> = sqlx::query_as(
        "SELECT image_path FROM clipboard_items WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(row.and_then(|(p,)| p))
}

/// Return all non-null image_paths for non-favorited items (used before clear_history).
pub async fn get_non_favorited_image_paths(pool: &SqlitePool) -> Result<Vec<String>, sqlx::Error> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT image_path FROM clipboard_items WHERE is_favorited = 0 AND image_path IS NOT NULL",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|(p,)| p).collect())
}

/// Return image_paths for items that would be removed by the given retention policy.
pub async fn get_retention_overflow_image_paths(
    pool: &SqlitePool,
    policy: &str,
    days: i64,
    count: i64,
) -> Result<Vec<String>, sqlx::Error> {
    let rows: Vec<(String,)> = match policy {
        "days" if days > 0 => {
            sqlx::query_as(
                "SELECT image_path FROM clipboard_items
                 WHERE is_favorited = 0
                   AND created_at < datetime('now', ? || ' days')
                   AND image_path IS NOT NULL",
            )
            .bind(format!("-{}", days))
            .fetch_all(pool)
            .await?
        }
        "count" if count > 0 => {
            sqlx::query_as(
                "SELECT image_path FROM clipboard_items
                 WHERE is_favorited = 0
                   AND id NOT IN (
                       SELECT id FROM clipboard_items
                       WHERE is_favorited = 0
                       ORDER BY updated_at DESC
                       LIMIT ?
                   )
                   AND image_path IS NOT NULL",
            )
            .bind(count)
            .fetch_all(pool)
            .await?
        }
        _ => vec![],
    };

    Ok(rows.into_iter().map(|(p,)| p).collect())
}

/// Return all non-null image_paths currently referenced in the database.
pub async fn get_all_image_paths(pool: &SqlitePool) -> Result<Vec<String>, sqlx::Error> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT image_path FROM clipboard_items WHERE image_path IS NOT NULL",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|(p,)| p).collect())
}

/// Delete a clipboard item and its FTS entry (transactional).
pub async fn delete_item(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM clipboard_fts WHERE item_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM clipboard_items WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(())
}

/// Search clipboard items using FTS5 trigram.
/// Excludes thumbnail blobs for fast IPC transfer.
pub async fn search_items(
    pool: &SqlitePool,
    query: &str,
    content_type: Option<&str>,
    limit: i64,
) -> Result<Vec<ClipboardItem>, sqlx::Error> {
    // Trigram requires >= 3 chars
    if query.chars().count() < 3 {
        // Fallback to LIKE for short queries
        return search_items_like(pool, query, content_type, limit).await;
    }

    let fts_query = format!("\"{}\"", query.replace('"', "\"\""));

    let item_ids: Vec<(String,)> = sqlx::query_as(
        "SELECT item_id FROM clipboard_fts WHERE clipboard_fts MATCH ? LIMIT ?",
    )
    .bind(&fts_query)
    .bind(limit)
    .fetch_all(pool)
    .await?;

    if item_ids.is_empty() {
        return Ok(vec![]);
    }

    let ids: Vec<String> = item_ids.into_iter().map(|r| r.0).collect();
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");

    let sql = if content_type.is_some() {
        format!(
            "SELECT id, content_type, plain_text, image_path, file_path, file_name, source_app, source_app_name, content_size, content_hash, is_favorited, created_at, updated_at
             FROM clipboard_items WHERE id IN ({}) AND content_type = ? ORDER BY updated_at DESC",
            placeholders
        )
    } else {
        format!(
            "SELECT id, content_type, plain_text, image_path, file_path, file_name, source_app, source_app_name, content_size, content_hash, is_favorited, created_at, updated_at
             FROM clipboard_items WHERE id IN ({}) ORDER BY updated_at DESC",
            placeholders
        )
    };

    let mut q = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, Option<String>, String, String, i64, String, bool, String, String)>(&sql);
    for id in &ids {
        q = q.bind(id);
    }
    if let Some(ct) = content_type {
        q = q.bind(ct);
    }

    let items = q.fetch_all(pool).await?;

    Ok(items
        .into_iter()
        .map(|r| ClipboardItem {
            id: r.0,
            content_type: r.1,
            plain_text: r.2,
            thumbnail: None,
            image_path: r.3,
            file_path: r.4,
            file_name: r.5,
            source_app: r.6,
            source_app_name: r.7,
            content_size: r.8,
            content_hash: r.9,
            is_favorited: r.10,
            created_at: r.11,
            updated_at: r.12,
        })
        .collect())
}

/// Fallback search using LIKE for queries shorter than 3 chars.
/// Excludes thumbnail blobs for fast IPC transfer.
async fn search_items_like(
    pool: &SqlitePool,
    query: &str,
    content_type: Option<&str>,
    limit: i64,
) -> Result<Vec<ClipboardItem>, sqlx::Error> {
    let like_pattern = format!("%{}%", query);

    let items = if let Some(ct) = content_type {
        sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, Option<String>, String, String, i64, String, bool, String, String)>(
            "SELECT id, content_type, plain_text, image_path, file_path, file_name, source_app, source_app_name, content_size, content_hash, is_favorited, created_at, updated_at
             FROM clipboard_items WHERE (plain_text LIKE ? OR file_name LIKE ? OR source_app_name LIKE ?) AND content_type = ? ORDER BY updated_at DESC LIMIT ?",
        )
        .bind(&like_pattern)
        .bind(&like_pattern)
        .bind(&like_pattern)
        .bind(ct)
        .bind(limit)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, Option<String>, String, String, i64, String, bool, String, String)>(
            "SELECT id, content_type, plain_text, image_path, file_path, file_name, source_app, source_app_name, content_size, content_hash, is_favorited, created_at, updated_at
             FROM clipboard_items WHERE (plain_text LIKE ? OR file_name LIKE ? OR source_app_name LIKE ?) ORDER BY updated_at DESC LIMIT ?",
        )
        .bind(&like_pattern)
        .bind(&like_pattern)
        .bind(&like_pattern)
        .bind(limit)
        .fetch_all(pool)
        .await?
    };

    Ok(items
        .into_iter()
        .map(|r| ClipboardItem {
            id: r.0,
            content_type: r.1,
            plain_text: r.2,
            thumbnail: None,
            image_path: r.3,
            file_path: r.4,
            file_name: r.5,
            source_app: r.6,
            source_app_name: r.7,
            content_size: r.8,
            content_hash: r.9,
            is_favorited: r.10,
            created_at: r.11,
            updated_at: r.12,
        })
        .collect())
}

/// Get the thumbnail blob for a single item.
pub async fn get_thumbnail(pool: &SqlitePool, id: &str) -> Result<Option<Vec<u8>>, sqlx::Error> {
    let row: Option<(Option<Vec<u8>>,)> = sqlx::query_as(
        "SELECT thumbnail FROM clipboard_items WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(row.and_then(|r| r.0))
}

/// Update the thumbnail for an existing clipboard item.
pub async fn update_thumbnail(pool: &SqlitePool, id: &str, thumbnail: &[u8]) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE clipboard_items SET thumbnail = ? WHERE id = ?")
        .bind(thumbnail)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

// ---- Favorites ----

/// Get all favorited items, optionally filtered by content type.
/// Excludes thumbnail blobs for fast IPC transfer.
pub async fn get_favorited_items(pool: &SqlitePool, content_type: Option<&str>, limit: i64, offset: i64) -> Result<Vec<super::models::ClipboardItem>, sqlx::Error> {
    let sql = if content_type.is_some() {
        "SELECT id, content_type, plain_text, image_path, file_path, file_name, source_app, source_app_name, content_size, content_hash, is_favorited, created_at, updated_at
         FROM clipboard_items WHERE is_favorited = 1 AND content_type = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?"
    } else {
        "SELECT id, content_type, plain_text, image_path, file_path, file_name, source_app, source_app_name, content_size, content_hash, is_favorited, created_at, updated_at
         FROM clipboard_items WHERE is_favorited = 1 ORDER BY updated_at DESC LIMIT ? OFFSET ?"
    };

    let items = if let Some(ct) = content_type {
        sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, Option<String>, String, String, i64, String, bool, String, String)>(sql)
            .bind(ct).bind(limit).bind(offset)
            .fetch_all(pool).await?
    } else {
        sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, Option<String>, String, String, i64, String, bool, String, String)>(sql)
            .bind(limit).bind(offset)
            .fetch_all(pool).await?
    };

    Ok(items
        .into_iter()
        .map(|r| super::models::ClipboardItem {
            id: r.0, content_type: r.1, plain_text: r.2, thumbnail: None,
            image_path: r.3, file_path: r.4, file_name: r.5,
            source_app: r.6, source_app_name: r.7, content_size: r.8,
            content_hash: r.9, is_favorited: r.10, created_at: r.11, updated_at: r.12,
        })
        .collect())
}

// ---- Settings ----

/// Get a setting value by key.
pub async fn get_setting(pool: &SqlitePool, key: &str) -> Result<Option<String>, sqlx::Error> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|r| r.0))
}

/// Get all settings as key-value pairs.
pub async fn get_all_settings(pool: &SqlitePool) -> Result<Vec<(String, String)>, sqlx::Error> {
    sqlx::query_as("SELECT key, value FROM settings ORDER BY key")
        .fetch_all(pool)
        .await
}

/// Set a setting value (upsert).
pub async fn set_setting(pool: &SqlitePool, key: &str, value: &str) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(key)
        .bind(value)
        .execute(pool)
        .await?;
    Ok(())
}

/// Clear all non-favorited clipboard items and their FTS entries (transactional).
pub async fn clear_history(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
    let mut tx = pool.begin().await?;

    sqlx::query(
        "DELETE FROM clipboard_fts WHERE item_id IN (SELECT id FROM clipboard_items WHERE is_favorited = 0)",
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "DELETE FROM item_groups WHERE item_id IN (SELECT id FROM clipboard_items WHERE is_favorited = 0)",
    )
    .execute(&mut *tx)
    .await?;

    let result = sqlx::query("DELETE FROM clipboard_items WHERE is_favorited = 0")
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(result.rows_affected() as i64)
}

/// Cleanup old items by retention policy (days or count). Preserves favorites. Transactional.
pub async fn cleanup_by_retention(
    pool: &SqlitePool,
    policy: &str,
    days: i64,
    count: i64,
) -> Result<i64, sqlx::Error> {
    match policy {
        "days" if days > 0 => {
            let mut tx = pool.begin().await?;
            let days_str = format!("-{}", days);

            sqlx::query(
                "DELETE FROM clipboard_fts WHERE item_id IN (
                    SELECT id FROM clipboard_items
                    WHERE is_favorited = 0
                    AND created_at < datetime('now', ? || ' days')
                )",
            )
            .bind(&days_str)
            .execute(&mut *tx)
            .await?;

            sqlx::query(
                "DELETE FROM item_groups WHERE item_id IN (
                    SELECT id FROM clipboard_items
                    WHERE is_favorited = 0
                    AND created_at < datetime('now', ? || ' days')
                )",
            )
            .bind(&days_str)
            .execute(&mut *tx)
            .await?;

            let result = sqlx::query(
                "DELETE FROM clipboard_items WHERE is_favorited = 0 AND created_at < datetime('now', ? || ' days')",
            )
            .bind(&days_str)
            .execute(&mut *tx)
            .await?;

            tx.commit().await?;

            Ok(result.rows_affected() as i64)
        }
        "count" if count > 0 => {
            let mut tx = pool.begin().await?;

            sqlx::query(
                "DELETE FROM clipboard_fts WHERE item_id IN (
                    SELECT id FROM clipboard_items
                    WHERE is_favorited = 0
                    ORDER BY updated_at DESC
                    LIMIT -1 OFFSET ?
                )",
            )
            .bind(count)
            .execute(&mut *tx)
            .await?;

            sqlx::query(
                "DELETE FROM item_groups WHERE item_id IN (
                    SELECT id FROM clipboard_items
                    WHERE is_favorited = 0
                    ORDER BY updated_at DESC
                    LIMIT -1 OFFSET ?
                )",
            )
            .bind(count)
            .execute(&mut *tx)
            .await?;

            let result = sqlx::query(
                "DELETE FROM clipboard_items WHERE is_favorited = 0 AND id NOT IN (
                    SELECT id FROM clipboard_items
                    WHERE is_favorited = 0
                    ORDER BY updated_at DESC
                    LIMIT ?
                )",
            )
            .bind(count)
            .execute(&mut *tx)
            .await?;

            tx.commit().await?;

            Ok(result.rows_affected() as i64)
        }
        _ => Ok(0), // "unlimited" or invalid - no cleanup
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{models::ContentType, test_pool};

    #[tokio::test]
    async fn test_insert_and_get() {
        let pool = test_pool().await;

        let item = NewClipboardItem {
            content_type: ContentType::PlainText,
            plain_text: "Hello from test".into(),
            rich_content: None,
            thumbnail: None,
            image_path: None,
            file_path: None,
            file_name: None,
            source_app: "com.test.app".into(),
            source_app_name: "TestApp".into(),
            content_size: 15,
            content_hash: "hash-test-1".into(),
        };

        let id = insert_item(&pool, &item).await.unwrap();
        assert!(!id.is_empty());

        let items = get_items(&pool, None, 10, 0).await.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].plain_text, "Hello from test");
        assert_eq!(items[0].source_app_name, "TestApp");
    }

    #[tokio::test]
    async fn test_dedup_by_hash() {
        let pool = test_pool().await;

        let item = NewClipboardItem {
            content_type: ContentType::PlainText,
            plain_text: "Duplicate content".into(),
            rich_content: None,
            thumbnail: None,
            image_path: None,
            file_path: None,
            file_name: None,
            source_app: "".into(),
            source_app_name: "".into(),
            content_size: 17,
            content_hash: "same-hash".into(),
        };

        let id1 = insert_item(&pool, &item).await.unwrap();

        // Second insert should be caught by dedup
        let existing = find_and_bump_by_hash(&pool, "same-hash").await.unwrap();
        assert_eq!(existing, Some(id1));
    }

    #[tokio::test]
    async fn test_dedup_bumps_updated_at() {
        let pool = test_pool().await;

        let item = NewClipboardItem {
            content_type: ContentType::PlainText,
            plain_text: "Bump test".into(),
            rich_content: None,
            thumbnail: None,
            image_path: None,
            file_path: None,
            file_name: None,
            source_app: "".into(),
            source_app_name: "".into(),
            content_size: 9,
            content_hash: "bump-hash".into(),
        };

        let id = insert_item(&pool, &item).await.unwrap();

        // Force updated_at to a known old date so we can detect the bump
        sqlx::query("UPDATE clipboard_items SET updated_at = '2000-01-01 00:00:00' WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .unwrap();

        let original_updated_at: (String,) = sqlx::query_as(
            "SELECT updated_at FROM clipboard_items WHERE id = ?",
        )
        .bind(&id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(original_updated_at.0, "2000-01-01 00:00:00");

        // Bump should update updated_at to current time
        let bumped = find_and_bump_by_hash(&pool, "bump-hash").await.unwrap();
        assert_eq!(bumped, Some(id.clone()));

        let new_updated_at: (String,) = sqlx::query_as(
            "SELECT updated_at FROM clipboard_items WHERE id = ?",
        )
        .bind(&id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(
            new_updated_at.0.as_str() > "2000-01-01 00:00:00",
            "updated_at should have been bumped from the old date, got: {}",
            new_updated_at.0
        );
    }

    #[tokio::test]
    async fn test_delete_item() {
        let pool = test_pool().await;

        let item = NewClipboardItem {
            content_type: ContentType::PlainText,
            plain_text: "To be deleted".into(),
            rich_content: None,
            thumbnail: None,
            image_path: None,
            file_path: None,
            file_name: None,
            source_app: "".into(),
            source_app_name: "".into(),
            content_size: 13,
            content_hash: "delete-hash".into(),
        };

        let id = insert_item(&pool, &item).await.unwrap();
        delete_item(&pool, &id).await.unwrap();

        let items = get_items(&pool, None, 10, 0).await.unwrap();
        assert_eq!(items.len(), 0);
    }

    #[tokio::test]
    async fn test_search_fts5() {
        let pool = test_pool().await;

        for (i, text) in ["Hello World example", "支持中文搜索功能测试", "Rust programming"]
            .iter()
            .enumerate()
        {
            let item = NewClipboardItem {
                content_type: ContentType::PlainText,
                plain_text: text.to_string(),
                rich_content: None,
                thumbnail: None,
                image_path: None,
                file_path: None,
                file_name: None,
                source_app: "".into(),
                source_app_name: "".into(),
                content_size: text.len() as i64,
                content_hash: format!("hash-{}", i),
            };
            insert_item(&pool, &item).await.unwrap();
        }

        // FTS search (>= 3 chars)
        let results = search_items(&pool, "World", None, 10).await.unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].plain_text.contains("World"));

        // Chinese search (>= 3 chars for trigram)
        let results = search_items(&pool, "中文搜", None, 10).await.unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].plain_text.contains("中文"));

        // Short query fallback to LIKE
        let results = search_items(&pool, "Ru", None, 10).await.unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].plain_text.contains("Rust"));

        // Type filter
        let results = search_items(&pool, "World", Some("image"), 10).await.unwrap();
        assert_eq!(results.len(), 0);
    }

    #[tokio::test]
    async fn test_get_items_type_filter() {
        let pool = test_pool().await;

        let text_item = NewClipboardItem {
            content_type: ContentType::PlainText,
            plain_text: "text content".into(),
            rich_content: None,
            thumbnail: None,
            image_path: None,
            file_path: None,
            file_name: None,
            source_app: "".into(),
            source_app_name: "".into(),
            content_size: 12,
            content_hash: "text-hash".into(),
        };

        let image_item = NewClipboardItem {
            content_type: ContentType::Image,
            plain_text: "".into(),
            rich_content: None,
            thumbnail: Some(vec![1, 2, 3]),
            image_path: Some("/tmp/test.png".into()),
            file_path: None,
            file_name: None,
            source_app: "".into(),
            source_app_name: "".into(),
            content_size: 1024,
            content_hash: "image-hash".into(),
        };

        insert_item(&pool, &text_item).await.unwrap();
        insert_item(&pool, &image_item).await.unwrap();

        let all = get_items(&pool, None, 10, 0).await.unwrap();
        assert_eq!(all.len(), 2);

        let text_only = get_items(&pool, Some("plain_text"), 10, 0).await.unwrap();
        assert_eq!(text_only.len(), 1);
        assert_eq!(text_only[0].content_type, "plain_text");

        let image_only = get_items(&pool, Some("image"), 10, 0).await.unwrap();
        assert_eq!(image_only.len(), 1);
        assert_eq!(image_only[0].content_type, "image");
    }

    #[tokio::test]
    async fn test_favorites() {
        let pool = test_pool().await;

        let item = NewClipboardItem {
            content_type: ContentType::PlainText,
            plain_text: "Favorite me".into(),
            rich_content: None, thumbnail: None, image_path: None,
            file_path: None, file_name: None,
            source_app: "".into(), source_app_name: "".into(),
            content_size: 11, content_hash: "fav-hash".into(),
        };
        let id = insert_item(&pool, &item).await.unwrap();

        // Not favorited initially
        let favs = get_favorited_items(&pool, None, 10, 0).await.unwrap();
        assert_eq!(favs.len(), 0);

        // Favorite it
        sqlx::query("UPDATE clipboard_items SET is_favorited = 1 WHERE id = ?")
            .bind(&id).execute(&pool).await.unwrap();

        let favs = get_favorited_items(&pool, None, 10, 0).await.unwrap();
        assert_eq!(favs.len(), 1);
        assert_eq!(favs[0].id, id);
    }

    #[tokio::test]
    async fn test_settings_crud() {
        let pool = test_pool().await;

        // Default settings should exist
        let shortcut = get_setting(&pool, "shortcut").await.unwrap();
        assert_eq!(shortcut, Some("CommandOrControl+Shift+V".to_string()));

        let theme = get_setting(&pool, "theme").await.unwrap();
        assert_eq!(theme, Some("dark".to_string()));

        // Update setting
        set_setting(&pool, "theme", "light").await.unwrap();
        let theme = get_setting(&pool, "theme").await.unwrap();
        assert_eq!(theme, Some("light".to_string()));

        // Get all settings
        let all = get_all_settings(&pool).await.unwrap();
        assert!(all.len() >= 9); // 9 default settings

        // Non-existent key
        let none = get_setting(&pool, "nonexistent").await.unwrap();
        assert_eq!(none, None);

        // Insert new key
        set_setting(&pool, "custom_key", "custom_value").await.unwrap();
        let val = get_setting(&pool, "custom_key").await.unwrap();
        assert_eq!(val, Some("custom_value".to_string()));
    }

    #[tokio::test]
    async fn test_clear_history_preserves_favorites() {
        let pool = test_pool().await;

        // Insert 3 items
        for i in 0..3 {
            let item = NewClipboardItem {
                content_type: ContentType::PlainText,
                plain_text: format!("Item {}", i),
                rich_content: None, thumbnail: None, image_path: None,
                file_path: None, file_name: None,
                source_app: "".into(), source_app_name: "".into(),
                content_size: 6, content_hash: format!("clear-hash-{}", i),
            };
            insert_item(&pool, &item).await.unwrap();
        }

        // Favorite the first item
        let items = get_items(&pool, None, 10, 0).await.unwrap();
        sqlx::query("UPDATE clipboard_items SET is_favorited = 1 WHERE id = ?")
            .bind(&items[0].id)
            .execute(&pool)
            .await
            .unwrap();

        // Clear history
        let deleted = clear_history(&pool).await.unwrap();
        assert_eq!(deleted, 2); // 2 non-favorited items deleted

        // Only favorite remains
        let remaining = get_items(&pool, None, 10, 0).await.unwrap();
        assert_eq!(remaining.len(), 1);
        assert!(remaining[0].is_favorited);
    }

    #[tokio::test]
    async fn test_cleanup_by_retention_count() {
        let pool = test_pool().await;

        // Insert 5 items with sequential timestamps
        for i in 0..5 {
            let item = NewClipboardItem {
                content_type: ContentType::PlainText,
                plain_text: format!("Retention item {}", i),
                rich_content: None, thumbnail: None, image_path: None,
                file_path: None, file_name: None,
                source_app: "".into(), source_app_name: "".into(),
                content_size: 16, content_hash: format!("ret-hash-{}", i),
            };
            insert_item(&pool, &item).await.unwrap();
        }

        // Keep only 2 most recent
        let deleted = cleanup_by_retention(&pool, "count", 0, 2).await.unwrap();
        assert_eq!(deleted, 3);

        let remaining = get_items(&pool, None, 10, 0).await.unwrap();
        assert_eq!(remaining.len(), 2);
    }

    #[tokio::test]
    async fn test_cleanup_unlimited_noop() {
        let pool = test_pool().await;

        let item = NewClipboardItem {
            content_type: ContentType::PlainText,
            plain_text: "Keep me".into(),
            rich_content: None, thumbnail: None, image_path: None,
            file_path: None, file_name: None,
            source_app: "".into(), source_app_name: "".into(),
            content_size: 7, content_hash: "noop-hash".into(),
        };
        insert_item(&pool, &item).await.unwrap();

        let deleted = cleanup_by_retention(&pool, "unlimited", 0, 0).await.unwrap();
        assert_eq!(deleted, 0);

        let remaining = get_items(&pool, None, 10, 0).await.unwrap();
        assert_eq!(remaining.len(), 1);
    }

}
