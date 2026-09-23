//! Migration tests use disposable databases only.
use super::{queries, SqlitePool, SqlitePoolOptions, MIGRATOR};
use sqlx::{migrate::Migrator, Row};
use std::{borrow::Cow, collections::BTreeMap};

pub(super) fn legacy_migrator() -> Migrator {
    Migrator {
        migrations: Cow::Owned(
            MIGRATOR
                .migrations
                .iter()
                .filter(|m| m.version < 6)
                .cloned()
                .collect(),
        ),
        ..Migrator::DEFAULT
    }
}

async fn seed(pool: &SqlitePool) {
    sqlx::query("INSERT INTO clipboard_items (id, content_type, plain_text, rich_content, thumbnail, image_path, file_path, file_name, source_app, source_app_name, content_size, content_hash, is_favorited, created_at, updated_at, note_title) VALUES ('old', 'rich_text', 'recopy 中文搜索 100%_', X'4142', X'0102', '/fixture/image.png', '/fixture/file', 'file', 'app', 'App', 100, 'hash', 1, '2000-01-01', '2000-01-02', '中文备注')")
        .execute(pool).await.unwrap();
    sqlx::query(
        "INSERT INTO clipboard_fts (item_id, plain_text) VALUES ('old', 'recopy 中文搜索 100%_')",
    )
    .execute(pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO groups (id, name) VALUES ('g', 'group')")
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO item_groups (item_id, group_id) VALUES ('old', 'g')")
        .execute(pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO clipboard_items (id, content_type, plain_text, content_hash, is_favorited, updated_at, note_title) VALUES ('new', 'plain_text', 'recopy 中文搜索', 'h2', 0, '2020-01-01', '中文备注'), ('third', 'link', 'https://example.test/recopy', 'h3', 1, '2021-01-01', '')")
        .execute(pool).await.unwrap();
    sqlx::query("INSERT INTO clipboard_fts (item_id, plain_text) SELECT id, plain_text FROM clipboard_items WHERE id != 'old'")
        .execute(pool).await.unwrap();
    queries::set_setting(pool, "theme", "light").await.unwrap();
}

async fn snapshot(pool: &SqlitePool) -> BTreeMap<String, Vec<Vec<String>>> {
    let mut result = BTreeMap::new();
    // Identifiers come only from fixed table names and checked-in migrations.
    for table in ["clipboard_items", "groups", "item_groups", "settings"] {
        let columns = sqlx::query(sqlx::AssertSqlSafe(format!("PRAGMA table_info({table})")))
            .fetch_all(pool)
            .await
            .unwrap();
        let projection = columns
            .iter()
            .map(|r| format!("quote(\"{}\")", r.get::<String, _>("name")))
            .collect::<Vec<_>>()
            .join(",");
        let rows = sqlx::query(sqlx::AssertSqlSafe(format!(
            "SELECT {projection} FROM {table} ORDER BY rowid"
        )))
        .fetch_all(pool)
        .await
        .unwrap();
        result.insert(
            table.to_string(),
            rows.into_iter()
                .map(|r| (0..columns.len()).map(|i| r.get(i)).collect())
                .collect(),
        );
    }
    result
}

async fn search_ids(pool: &SqlitePool) -> Vec<Vec<String>> {
    let mut result = Vec::new();
    for query in ["rcp", "中文", "中文 rcp", "100%_", "中文备注", "missing"] {
        for favorite in [false, true] {
            result.push(
                queries::search_items(pool, query, None, 50, favorite)
                    .await
                    .unwrap()
                    .into_iter()
                    .map(|r| r.id)
                    .collect(),
            );
        }
    }
    result
}

#[tokio::test]
async fn upgrade_preserves_all_source_columns_and_search_and_is_idempotent() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    legacy_migrator().run(&pool).await.unwrap();
    seed(&pool).await;
    let before = snapshot(&pool).await;
    let searches = search_ids(&pool).await;
    MIGRATOR.run(&pool).await.unwrap();
    MIGRATOR.run(&pool).await.unwrap();
    assert_eq!(snapshot(&pool).await, before);
    assert_eq!(search_ids(&pool).await, searches);
    let remaining: i64 =
        sqlx::query_scalar("SELECT count(*) FROM sqlite_master WHERE name GLOB 'clipboard_fts*'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(remaining, 0);
    assert!(matches!(
        legacy_migrator().run(&pool).await,
        Err(sqlx::migrate::MigrateError::VersionMissing(6))
    ));
}

#[tokio::test]
async fn failed_migration_rolls_back_index_drop_and_can_retry() {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    legacy_migrator().run(&pool).await.unwrap();
    seed(&pool).await;
    let before = snapshot(&pool).await;
    let mut migrations = MIGRATOR.migrations.to_vec();
    let index = migrations.iter().position(|m| m.version == 6).unwrap();
    migrations[index] = sqlx::migrate::Migration::new(
        6,
        "failure injection".into(),
        sqlx::migrate::MigrationType::Simple,
        sqlx::SqlStr::from_static(concat!(
            include_str!("../../migrations/006_remove_unused_fts.sql"),
            "\nSELECT * FROM injected_missing_table;"
        )),
        false,
    );
    let failing = Migrator {
        migrations: Cow::Owned(migrations),
        ..Migrator::DEFAULT
    };
    assert!(failing.run(&pool).await.is_err());
    assert_eq!(snapshot(&pool).await, before);
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM clipboard_fts")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(count, 3);
    MIGRATOR.run(&pool).await.unwrap();
    assert_eq!(snapshot(&pool).await, before);
}

#[tokio::test]
async fn preupgrade_closed_database_backup_remains_usable_by_legacy_version() {
    let root = std::env::temp_dir().join(format!("recopy-fts-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let live = root.join("live.db");
    let backup = root.join("backup.db");
    let options = super::SqliteConnectOptions::new()
        .filename(&live)
        .create_if_missing(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options.clone())
        .await
        .unwrap();
    legacy_migrator().run(&pool).await.unwrap();
    seed(&pool).await;
    let before = snapshot(&pool).await;
    // Safe copy of a closed fixture DB. Not a recipe for copying a live WAL database.
    pool.close().await;
    std::fs::copy(&live, &backup).unwrap();
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .unwrap();
    MIGRATOR.run(&pool).await.unwrap();
    pool.close().await;
    let restored = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(super::SqliteConnectOptions::new().filename(&backup))
        .await
        .unwrap();
    legacy_migrator().run(&restored).await.unwrap();
    assert_eq!(snapshot(&restored).await, before);
    sqlx::query(
        "INSERT INTO clipboard_fts (item_id, plain_text) VALUES ('rollback-probe', 'working')",
    )
    .execute(&restored)
    .await
    .unwrap();
    restored.close().await;
    std::fs::remove_file(live).unwrap();
    std::fs::remove_file(backup).unwrap();
    std::fs::remove_dir(root).unwrap();
}
