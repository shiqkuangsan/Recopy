use std::{io::Read, path::Path};
use tokio::sync::Semaphore;

/// Shared by captured images and best-effort file thumbnails.
/// Move the permit into blocking work so cancellation cannot release it early.
pub static THUMBNAIL_SLOTS: Semaphore = Semaphore::const_new(2);

pub fn try_file_thumbnail(
    path: std::path::PathBuf,
    max_bytes: u64,
) -> Option<tokio::task::JoinHandle<Result<Vec<u8>, String>>> {
    try_spawn_thumbnail(&THUMBNAIL_SLOTS, move || {
        let bytes = read_thumbnail_file(&path, max_bytes)?;
        super::generate_thumbnail(&bytes)
    })
}

fn try_spawn_thumbnail(
    slots: &'static Semaphore,
    work: impl FnOnce() -> Result<Vec<u8>, String> + Send + 'static,
) -> Option<tokio::task::JoinHandle<Result<Vec<u8>, String>>> {
    let permit = slots.try_acquire().ok()?;
    Some(tokio::task::spawn_blocking(move || {
        let _permit = permit;
        work()
    }))
}

/// Run only after admission, on a blocking worker. Limit actual reads as well as metadata.
pub fn read_thumbnail_file(path: &Path, max_bytes: u64) -> Result<Vec<u8>, String> {
    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > max_bytes {
        return Err("File exceeds thumbnail input budget or is not a regular file".into());
    }
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("Thumbnail input is not a regular file".into());
    }
    read_limited(file, max_bytes)
}

fn read_limited(reader: impl Read, max_bytes: u64) -> Result<Vec<u8>, String> {
    let mut data = Vec::new();
    reader
        .take(max_bytes.saturating_add(1))
        .read_to_end(&mut data)
        .map_err(|e| e.to_string())?;
    if data.len() as u64 > max_bytes {
        return Err("File grew beyond thumbnail input budget".into());
    }
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn actual_read_is_bounded_even_if_metadata_was_stale() {
        let mut source = std::io::Cursor::new(vec![0; 100]);
        assert!(read_limited(&mut source, 10).is_err());
        assert_eq!(source.position(), 11);
        assert_eq!(read_limited(&b"abc"[..], 3).unwrap(), b"abc");
    }

    #[tokio::test]
    async fn admission_rejects_third_job_before_its_reader_runs() {
        static SLOTS: Semaphore = Semaphore::const_new(2);
        let mut jobs = Vec::new();
        let mut releases = Vec::new();
        for _ in 0..2 {
            let (tx, rx) = std::sync::mpsc::channel();
            jobs.push(
                try_spawn_thumbnail(&SLOTS, move || {
                    rx.recv().unwrap();
                    Ok(vec![])
                })
                .unwrap(),
            );
            releases.push(tx);
        }
        let read = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let observed = read.clone();
        assert!(try_spawn_thumbnail(&SLOTS, move || {
            observed.store(true, std::sync::atomic::Ordering::SeqCst);
            Ok(vec![])
        })
        .is_none());
        assert!(!read.load(std::sync::atomic::Ordering::SeqCst));
        for release in releases {
            release.send(()).unwrap();
        }
        for job in jobs {
            job.await.unwrap().unwrap();
        }
        assert_eq!(SLOTS.available_permits(), 2);
    }

    #[tokio::test]
    async fn blocking_work_keeps_permit_after_waiter_is_cancelled() {
        let slots = std::sync::Arc::new(Semaphore::new(1));
        let permit = slots.clone().acquire_owned().await.unwrap();
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (finish_tx, finish_rx) = std::sync::mpsc::channel();
        let task = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            started_tx.send(()).unwrap();
            finish_rx.recv().unwrap();
        });
        started_rx.await.unwrap();
        task.abort();
        assert!(slots.try_acquire().is_err());
        finish_tx.send(()).unwrap();
        task.await.unwrap();
        assert_eq!(slots.available_permits(), 1);
    }
}
