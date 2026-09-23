use std::io::Read;
use std::path::{Path, PathBuf};

/// A directory owned by exactly one capture. Never clean a shared plugin directory.
struct CaptureDirectory(PathBuf);

impl Drop for CaptureDirectory {
    fn drop(&mut self) {
        if let Err(error) = std::fs::remove_dir_all(&self.0) {
            log::warn!("Failed to clean capture staging directory: {}", error);
        }
    }
}

/// Called before monitoring starts. Reclaim only UUID capture directories in our
/// dedicated namespace after an interrupted process; unknown entries stay untouched.
pub fn cleanup_staging(root: &Path) -> Result<usize, String> {
    let entries = match std::fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(error) => return Err(error.to_string()),
    };
    let mut count = 0;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map_err(|e| e.to_string())?.is_dir()
            && entry.file_name().to_str().is_some_and(|name| {
                uuid::Uuid::parse_str(name).is_ok_and(|id| id.to_string() == name)
            })
        {
            std::fs::remove_dir_all(entry.path()).map_err(|e| e.to_string())?;
            count += 1;
        }
    }
    Ok(count)
}

/// Run on a blocking worker. The producer receives a unique, already-created directory.
/// Keep ownership through producer errors, short reads, size rejection, and unwinding.
pub fn read_staged_image(
    staging_root: &Path,
    max_bytes: usize,
    produce: impl FnOnce(&Path) -> Result<PathBuf, String>,
) -> Result<Option<Vec<u8>>, String> {
    std::fs::create_dir_all(staging_root).map_err(|e| e.to_string())?;
    let path = staging_root.join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir(&path).map_err(|e| e.to_string())?;
    let directory = CaptureDirectory(path);
    let image = produce(&directory.0)?;
    if image.parent() != Some(directory.0.as_path())
        || !std::fs::symlink_metadata(&image)
            .map_err(|e| e.to_string())?
            .file_type()
            .is_file()
    {
        return Err("Image producer returned a path outside its capture directory".into());
    }
    let file = std::fs::File::open(&image).map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() > max_bytes as u64 {
        return Ok(None);
    }
    // Bound reads even when a file grows after the metadata check.
    let mut bytes = Vec::new();
    file.take((max_bytes as u64).saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    Ok((bytes.len() <= max_bytes).then_some(bytes))
}

/// An original is required; thumbnail generation is best effort.
pub fn prepare_image(app_data: &Path, content: &[u8]) -> Result<(Option<Vec<u8>>, String), String> {
    let thumbnail = super::generate_thumbnail(content).ok();
    let path = super::save_original_image(app_data, content, "png")?;
    Ok((thumbnail, path))
}

/// Caller transfers ownership of this newly-created item's original image.
/// A failed transaction must not leak that original; existing records never use this helper.
pub async fn insert_captured_item(
    pool: &sqlx::SqlitePool,
    item: &crate::db::models::NewClipboardItem,
) -> Result<String, String> {
    match crate::db::queries::insert_item(pool, item).await {
        Ok(id) => Ok(id),
        Err(error) => {
            if let Some(path) = &item.image_path {
                // A commit error can be ambiguous. Keep the file unless the database
                // confirms that no committed row references it; startup GC can retry.
                let referenced: Result<(bool,), _> = sqlx::query_as(
                    "SELECT EXISTS(SELECT 1 FROM clipboard_items WHERE image_path = ?)",
                )
                .bind(path)
                .fetch_one(pool)
                .await;
                if matches!(referenced, Ok((false,))) {
                    if let Err(cleanup) = tokio::fs::remove_file(path).await {
                        log::warn!("Failed to clean original after insert failure: {}", cleanup);
                    }
                }
            }
            Err(error.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestDirectory(PathBuf);
    impl TestDirectory {
        fn new() -> Self {
            let path =
                std::env::temp_dir().join(format!("recopy-storage-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TestDirectory {
        fn drop(&mut self) {
            std::fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[test]
    fn startup_cleanup_reclaims_interrupted_capture_but_preserves_unknown_entries() {
        let root = TestDirectory::new();
        let interrupted = root.0.join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir(&interrupted).unwrap();
        std::fs::write(interrupted.join("partial.png"), b"partial").unwrap();
        let unknown = root.0.join("keep");
        std::fs::create_dir(&unknown).unwrap();
        let file = root.0.join(uuid::Uuid::new_v4().to_string());
        std::fs::write(&file, b"keep").unwrap();
        assert_eq!(cleanup_staging(&root.0).unwrap(), 1);
        assert!(!interrupted.exists());
        assert!(unknown.exists() && file.exists());
        assert_eq!(cleanup_staging(&root.0).unwrap(), 0);
    }

    #[test]
    fn staging_cleans_success_oversize_producer_and_read_errors() {
        let root = TestDirectory::new();
        for scenario in 0..4 {
            let result = read_staged_image(&root.0, 4, |directory| {
                let path = directory.join("image.png");
                if scenario != 3 {
                    std::fs::write(
                        &path,
                        if scenario == 1 {
                            b"12345".as_slice()
                        } else {
                            b"1234"
                        },
                    )
                    .unwrap();
                }
                if scenario == 2 {
                    return Err("producer failed after writing".into());
                }
                Ok(path)
            });
            match scenario {
                0 => assert_eq!(result.unwrap(), Some(b"1234".to_vec())),
                1 => assert_eq!(result.unwrap(), None),
                _ => assert!(result.is_err()),
            }
            assert_eq!(std::fs::read_dir(&root.0).unwrap().count(), 0);
        }
    }

    #[test]
    fn staging_preserves_files_it_does_not_own() {
        let root = TestDirectory::new();
        let sentinel = root.0.join("existing.png");
        std::fs::write(&sentinel, b"keep").unwrap();
        assert!(read_staged_image(&root.0, 8, |_| Ok(sentinel.clone())).is_err());
        assert_eq!(std::fs::read(&sentinel).unwrap(), b"keep");
        assert_eq!(std::fs::read_dir(&root.0).unwrap().count(), 1);
    }

    #[test]
    fn staging_cleanup_runs_when_producer_unwinds() {
        let root = TestDirectory::new();
        let result = std::panic::catch_unwind(|| {
            read_staged_image(&root.0, 10, |dir| {
                std::fs::write(dir.join("partial.png"), b"partial").unwrap();
                panic!("producer panic");
            })
        });
        assert!(result.is_err());
        assert_eq!(std::fs::read_dir(&root.0).unwrap().count(), 0);
    }

    #[cfg(unix)]
    #[test]
    fn staging_rejects_symlinks_and_cleanup_does_not_follow_them() {
        let root = TestDirectory::new();
        let outside = TestDirectory::new();
        let target = outside.0.join("keep.png");
        std::fs::write(&target, b"keep").unwrap();
        assert!(read_staged_image(&root.0, 10, |dir| {
            let link = dir.join("image.png");
            std::os::unix::fs::symlink(&target, &link).unwrap();
            Ok(link)
        })
        .is_err());
        let directory_link = root.0.join(uuid::Uuid::new_v4().to_string());
        std::os::unix::fs::symlink(&outside.0, &directory_link).unwrap();
        assert_eq!(cleanup_staging(&root.0).unwrap(), 0);
        assert_eq!(std::fs::read(target).unwrap(), b"keep");
    }

    #[test]
    fn oversized_thumbnail_header_preserves_original_bytes() {
        let root = TestDirectory::new();
        let bytes = b"P6\n6000 6000\n255\n";
        let (thumb, path) = prepare_image(&root.0, bytes).unwrap();
        assert!(thumb.is_none());
        assert_eq!(std::fs::read(path).unwrap(), bytes);
    }

    #[test]
    fn original_write_failure_is_fatal_but_thumbnail_failure_is_not() {
        let root = TestDirectory::new();
        let blocker = root.0.join("blocked");
        std::fs::write(&blocker, b"file, not a directory").unwrap();
        assert!(prepare_image(&blocker, b"bytes").is_err());
        let (thumb, path) = prepare_image(&root.0, b"unrecognized image bytes").unwrap();
        assert!(thumb.is_none());
        assert_eq!(std::fs::read(path).unwrap(), b"unrecognized image bytes");
    }

    #[tokio::test]
    async fn typed_hash_dedup_preserves_legacy_and_distinguishes_rich_formatting() {
        use crate::db::{
            models::{ContentType, NewClipboardItem},
            queries,
        };
        let pool = crate::db::test_pool().await;
        let mut item = NewClipboardItem {
            content_type: ContentType::PlainText,
            plain_text: "same".into(),
            rich_content: None,
            thumbnail: None,
            image_path: None,
            file_path: None,
            file_name: None,
            source_app: String::new(),
            source_app_name: String::new(),
            content_size: 4,
            content_hash: super::super::compute_hash(b"same"),
        };
        let legacy_hash = item.content_hash.clone();
        let legacy_id = queries::insert_item(&pool, &item).await.unwrap();
        assert_eq!(
            queries::find_and_bump_legacy(&pool, &legacy_hash, "plain_text", None)
                .await
                .unwrap(),
            Some(legacy_id.clone())
        );
        assert_eq!(
            queries::find_and_bump_legacy(&pool, &legacy_hash, "rich_text", Some(b"<b>same</b>"))
                .await
                .unwrap(),
            None
        );
        item.content_type = ContentType::RichText;
        item.rich_content = Some(b"<b>same</b>".to_vec());
        let legacy_rich = queries::insert_item(&pool, &item).await.unwrap();
        assert_eq!(
            queries::find_and_bump_legacy(&pool, &legacy_hash, "rich_text", Some(b"<b>same</b>"))
                .await
                .unwrap(),
            Some(legacy_rich)
        );
        assert_eq!(
            queries::find_and_bump_legacy(&pool, &legacy_hash, "rich_text", Some(b"<i>same</i>"))
                .await
                .unwrap(),
            None
        );
        for (kind, rich) in [
            (ContentType::PlainText, None),
            (ContentType::RichText, Some(b"<b>same</b>".to_vec())),
            (ContentType::RichText, Some(b"<i>same</i>".to_vec())),
        ] {
            item.content_type = kind;
            item.rich_content = rich;
            item.content_hash = super::super::content_identity(
                item.content_type.as_str(),
                b"same",
                item.rich_content.as_deref(),
            );
            assert!(queries::find_and_bump_by_hash(&pool, &item.content_hash)
                .await
                .unwrap()
                .is_none());
            let id = queries::insert_item(&pool, &item).await.unwrap();
            assert_eq!(
                queries::find_and_bump_by_hash(&pool, &item.content_hash)
                    .await
                    .unwrap(),
                Some(id)
            );
        }
        let stored: (String,) =
            sqlx::query_as("SELECT content_hash FROM clipboard_items WHERE id = ?")
                .bind(legacy_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(stored.0, legacy_hash);
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM clipboard_items")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 5);
    }

    #[tokio::test]
    async fn failed_insert_reclaims_only_new_original_and_success_preserves_it() {
        let root = TestDirectory::new();
        let pool = crate::db::test_pool().await;
        let make_item = || crate::db::models::NewClipboardItem {
            content_type: crate::db::models::ContentType::Image,
            plain_text: String::new(),
            rich_content: None,
            thumbnail: None,
            image_path: Some(super::super::save_original_image(&root.0, b"png", "png").unwrap()),
            file_path: None,
            file_name: None,
            source_app: String::new(),
            source_app_name: String::new(),
            content_size: 3,
            content_hash: "new-image".into(),
        };
        let saved = make_item();
        insert_captured_item(&pool, &saved).await.unwrap();
        assert!(Path::new(saved.image_path.as_ref().unwrap()).exists());
        // An AFTER trigger aborts the actual INSERT and exercises transaction rollback.
        sqlx::query("CREATE TRIGGER reject_test_insert AFTER INSERT ON clipboard_items BEGIN SELECT RAISE(ABORT, 'injected insert failure'); END")
            .execute(&pool)
            .await
            .unwrap();
        let rejected = make_item();
        assert!(insert_captured_item(&pool, &rejected).await.is_err());
        assert!(!Path::new(rejected.image_path.as_ref().unwrap()).exists());
        assert!(Path::new(saved.image_path.as_ref().unwrap()).exists());
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM clipboard_items")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 1);
        // An existing reference must win over cleanup, even after another failed INSERT.
        assert!(insert_captured_item(&pool, &saved).await.is_err());
        assert!(Path::new(saved.image_path.as_ref().unwrap()).exists());
        let uncertain = make_item();
        pool.close().await;
        assert!(insert_captured_item(&pool, &uncertain).await.is_err());
        assert!(Path::new(uncertain.image_path.as_ref().unwrap()).exists());
    }
}
