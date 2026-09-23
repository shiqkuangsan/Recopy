# Image resource and thread-boundary review (FR-082)

## Changes

- Captured-image preparation and file thumbnails share two permits. Permits live
  inside blocking jobs until actual completion, even when their waiter is cancelled.
- File thumbnails obtain admission before spawning or reading. Saturated jobs are
  skipped, preserving the clipboard file record; there is no deferred retry queue.
- File reads use both regular-file/metadata checks and a max-bytes-plus-one reader,
  using the configured item limit capped at 100MiB. Growing files are rejected.
- Thumbnail headers are checked before pixel decode: at most 32768 per edge,
  32 million pixels and 128MiB output. The decoder budget reserves output bytes
  before assigning its remaining allocation allowance. Original captures remain
  saved if thumbnail generation rejects the image.
- AppKit menu-bar height reads are main-thread guarded. Setup seeds an atomic
  cache; worker callers only read that cache. Opening a preview asynchronously
  refreshes it on the main thread without blocking an async worker.
- Orphan-image traversal and storage-size traversal run on blocking workers.
  Startup still waits for cleanup before starting the clipboard monitor.

## Evidence

- macOS cargo test: 88 passed, 0 failed. Five new tests cover bounded reads,
  header-only pixel/high-depth rejection, original preservation, actual admission
  before the third reader and cancellation ownership.
- cargo clippy --all-targets -- -D warnings and git diff --check passed.
- Independent read-only review found a synchronous call-site compatibility issue
  and missing output reservation. Both were fixed; final review passed.
- Tests use synthetic inputs, test temporary files and test databases only.

## Limits and follow-up

The 128MiB budget is not a hard task/process RSS limit: image-library allocation
limits are best effort; compressed input, scaling buffers and clipboard plugin
capture/decode allocations are outside the combined accounting. This is a bound
on admitted thumbnail work and decoded output, not proof of end-to-end memory use.
Busy file thumbnails can remain absent. Cached menu height can be stale until
main-thread refresh. Native display changes, positioning and real capture CPU/RSS
have not been validated. Windows target execution has not been performed.
macOS paste image reads and native paste ordering remain a separate follow-up.
