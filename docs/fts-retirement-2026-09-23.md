# Retire unused FTS (FR-084)

## Implementation

Migration 006 drops only clipboard_fts and its derived shadow tables. Migrations
001–005 remain unchanged. Five FTS-maintenance statements are removed from insert,
delete, history clear and both retention paths; business transactions remain intact.
Search SQL is unchanged, including Chinese/non-contiguous fuzzy matching, note
ranking, favorites, wildcard escaping and recency tie-breaks. This removes unused
write/storage work; it does not fix the complexity of LIKE scans.

No automatic VACUUM is performed: freed SQLite pages can be reused, but the database
file need not shrink. No real user database was opened or migrated during this work.

## Verification

- Full Rust suite: 92 passed, one benchmark ignored; strict Clippy passed.
- Migration tests compare every column of clipboard_items, groups, item_groups and
  settings before/after upgrade. Three rows cover different types, favorites,
  timestamps and notes, plus rich bytes, thumbnail bytes and original/file paths.
- Twelve query/favorite combinations preserve ordered IDs. Migration rerun is safe;
  no FTS or shadow table remains. Existing search/write/delete/retention tests pass
  against the newest schema without FTS.
- A SQL failure injected after DROP rolls back the migration, preserves original
  rows and FTS entries, and allows retry with the real migration.
- Storage insertion failure uses a test-only AFTER INSERT ABORT trigger, preserving
  the rollback/reference/original-file cleanup checks after FTS removal.
- Independent read-only migration review passed after fixing the old FTS-dependent
  failure injection. The opt-in search benchmark is rerun separately; it recreates
  the legacy index only inside its disposable database for cost/recall comparisons.

## Downgrade and release boundary

An old migrator (through version 5) rejects the upgraded database with
VersionMissing(6). Simply replacing the program with an old binary is unsupported.
A test verifies that a closed pre-upgrade fixture database copy remains usable by
the old migrator and accepts legacy FTS writes. This is not validation of a live WAL
backup or actual old binary, and the application does not create a new backup here.

Before release/use against a real history, retain a consistent pre-upgrade database
backup and matching original-image files. Do not copy only the live .db file while
ignoring WAL, and do not bypass the migration ledger. Restoring a pre-upgrade backup
also excludes later writes; preserve those separately if rollback becomes necessary.
Production upgrade, large disk databases and real rollback remain release checks.

## Benchmark interpretation

Run cargo test --manifest-path src-tauri/Cargo.toml search_cost_baseline -- --ignored --nocapture.
The output now labels production writes as actual_insert_without_fts_total_ms.
The historical report in paste-search-review-2026-09-23.md records the previous
implementation. Cross-run wall times are not a controlled before/after speedup;
SQLite pages, caches and machine load vary. MATCH is still not a compatible search
replacement. No change to user-facing search semantics is intended.
