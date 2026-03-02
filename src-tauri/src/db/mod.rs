pub mod models;
pub mod queries;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::fs;
use std::str::FromStr;
use tauri::{AppHandle, Manager};

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

/// Get the database file path based on the app data directory.
fn db_path(app: &AppHandle) -> String {
    let app_data = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    fs::create_dir_all(&app_data).expect("Failed to create app data dir");
    app_data.join("recopy.db").to_string_lossy().to_string()
}

/// Initialize the database connection pool and run migrations.
pub async fn init(app: &AppHandle) -> Result<SqlitePool, sqlx::Error> {
    let db_url = format!("sqlite://{}?mode=rwc", db_path(app));

    let options = SqliteConnectOptions::from_str(&db_url)?
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    // Run migrations
    MIGRATOR.run(&pool).await?;

    // Store pool in app state
    app.manage(DbPool(pool.clone()));

    log::info!("Database initialized at: {}", db_url);

    Ok(pool)
}

/// Wrapper around SqlitePool for Tauri state management.
pub struct DbPool(pub SqlitePool);

/// Helper to create a test pool with in-memory SQLite and run migrations.
#[cfg(test)]
async fn test_pool() -> SqlitePool {
    let options = SqliteConnectOptions::from_str("sqlite::memory:")
        .unwrap()
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .unwrap();

    MIGRATOR.run(&pool).await.unwrap();
    pool
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_tables_exist() {
        let pool = test_pool().await;

        let tables: Vec<(String,)> = sqlx::query_as(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_sqlx_%' ORDER BY name",
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        let names: Vec<&str> = tables.iter().map(|t| t.0.as_str()).collect();
        assert!(names.contains(&"clipboard_items"));
        assert!(names.contains(&"groups"));
        assert!(names.contains(&"item_groups"));
        assert!(names.contains(&"settings"));
    }

    #[tokio::test]
    async fn test_clipboard_item_crud() {
        let pool = test_pool().await;

        // Insert
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO clipboard_items (id, content_type, plain_text, content_size, content_hash)
             VALUES (?, 'plain_text', 'Hello, World!', 13, 'abc123')",
        )
        .bind(&id)
        .execute(&pool)
        .await
        .unwrap();

        // Read
        let row: (String, String, String) =
            sqlx::query_as("SELECT id, content_type, plain_text FROM clipboard_items WHERE id = ?")
                .bind(&id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(row.0, id);
        assert_eq!(row.1, "plain_text");
        assert_eq!(row.2, "Hello, World!");

        // Update (favorite)
        sqlx::query("UPDATE clipboard_items SET is_favorited = 1 WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .unwrap();

        let fav: (bool,) = sqlx::query_as("SELECT is_favorited FROM clipboard_items WHERE id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(fav.0);

        // Delete
        sqlx::query("DELETE FROM clipboard_items WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .unwrap();

        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM clipboard_items WHERE id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 0);
    }

    #[tokio::test]
    async fn test_fts5_search() {
        let pool = test_pool().await;

        // Insert test data into both clipboard_items and clipboard_fts
        let test_data = [
            ("id-1", "Hello World"),
            ("id-2", "支持中文搜索功能"),
            ("id-3", "Rust programming language"),
        ];

        for (id, text) in &test_data {
            sqlx::query(
                "INSERT INTO clipboard_items (id, content_type, plain_text, content_size, content_hash)
                 VALUES (?, 'plain_text', ?, ?, ?)",
            )
            .bind(id)
            .bind(text)
            .bind(text.len() as i64)
            .bind(format!("hash-{}", id))
            .execute(&pool)
            .await
            .unwrap();

            // Manually sync to FTS table
            sqlx::query(
                "INSERT INTO clipboard_fts (item_id, plain_text, file_name, source_app_name)
                 VALUES (?, ?, '', '')",
            )
            .bind(id)
            .bind(text)
            .execute(&pool)
            .await
            .unwrap();
        }

        // Search English substring (trigram requires >= 3 chars)
        let results: Vec<(String,)> = sqlx::query_as(
            "SELECT item_id FROM clipboard_fts WHERE clipboard_fts MATCH '\"World\"'",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0, "id-1");

        // Search Chinese substring (trigram: 3 unicode codepoints minimum)
        let results: Vec<(String,)> = sqlx::query_as(
            "SELECT item_id FROM clipboard_fts WHERE clipboard_fts MATCH '\"中文搜\"'",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0, "id-2");

        // Search "Rust" (4 chars, should work)
        let results: Vec<(String,)> = sqlx::query_as(
            "SELECT item_id FROM clipboard_fts WHERE clipboard_fts MATCH '\"Rust\"'",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0, "id-3");

        // No results
        let results: Vec<(String,)> = sqlx::query_as(
            "SELECT item_id FROM clipboard_fts WHERE clipboard_fts MATCH '\"xyz123\"'",
        )
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(results.len(), 0);
    }

    #[tokio::test]
    async fn test_default_settings() {
        let pool = test_pool().await;

        let shortcut: (String,) =
            sqlx::query_as("SELECT value FROM settings WHERE key = 'shortcut'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(shortcut.0, "CommandOrControl+Shift+V");

        let theme: (String,) = sqlx::query_as("SELECT value FROM settings WHERE key = 'theme'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(theme.0, "dark");

        let max_size: (String,) =
            sqlx::query_as("SELECT value FROM settings WHERE key = 'max_item_size_mb'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(max_size.0, "10");
    }
}
