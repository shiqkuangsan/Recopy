# Paste thread boundary and search baseline (FR-083)

## Image paste

Image metadata/read now use Tokio filesystem operations. Native PNG pasteboard writing is
dispatched to the main thread and awaited before focus restoration and simulated paste.
Native item data is prepared before clearing the pasteboard. The worker-thread guard test
rejects native writing before any pasteboard access.

Cancellation is best effort: a closed receiver at closure entry skips a queued write;
cancellation after that check may still complete a write. Existing skip-next-monitor state
can remain set if the entire paste future is dropped; this is not a transactional cancellation
fix. NSData copying still runs on the main thread and no native latency/RSS gain is claimed.

## Reproducible synthetic search benchmark

Run: `cargo test --manifest-path src-tauri/Cargo.toml search_cost_baseline -- --ignored --nocapture`.
This run used the default debug/test profile on macOS and migrated in-memory SQLite.
It calls production insert/search functions with repeated synthetic text and 10% named favorites.
Each query uses one warmup and seven measured runs, returning at most 50 items. Times include
SQLx and row materialization, excluding IPC, UI, filesystem and JSON. This is not user-history
performance, release-build performance or a representative content distribution.

| Rows | Bytes/body | rcp median ms | 中文 median ms | 中文 rcp median ms | Missing median ms | Note median ms | Favorites median ms |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1000 | 768 | 3.57 | 2.67 | 6.22 | 1.24 | 3.64 | 1.52 |
| 10000 | 768 | 28.21 | 13.82 | 44.45 | 10.98 | 53.56 | 13.61 |
| 1000 | 12288 | 19.69 | 5.02 | 40.83 | 8.57 | 27.86 | 3.47 |

| Rows | Bytes/body | All production inserts ms | FTS rebuild median ms | FTS freed page bytes |
|---:|---:|---:|---:|---:|
| 1000 | 768 | 271.16 | 38.93 | 1933312 |
| 10000 | 768 | 4526.71 | 552.47 | 18911232 |
| 1000 | 12288 | 999.86 | 505.44 | 23527424 |

FTS rebuild is INSERT SELECT timed inside five rolled-back transactions after DELETE.
It excludes deletion/commit cost and is not the difference between inserts with/without FTS.
Freed bytes are the increase in freelist pages after DROP TABLE in this disposable DB,
not actual disk space recovered. Identical ordered search IDs were verified before/after DROP.

All three data sizes return fuzzy matches for rcp, but MATCH rcp returns zero. Switching to
MATCH would change recall. FTS currently adds measurable maintenance/storage without serving
production search; removal deserves a separate forward-migration and rollback review.
Removing it alone will not accelerate the LIKE search scan. Keep Chinese/fuzzy/note ranking
semantics while investigating candidate filtering. No production schema/query changes here.

## Verification and limits

Full Rust tests and strict Clippy are recorded in FR-083 evidence. The benchmark is ignored
in the normal suite. Independent static review confirms ordering and isolated DB scope.
Native macOS target-app paste/focus and Windows execution remain untested. No real clipboard
or user DB was accessed. Test inputs and timing evidence only; no release or push.
