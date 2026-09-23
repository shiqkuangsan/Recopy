-- Search uses LIKE against clipboard_items, including note_title and fuzzy matching.
-- Retire only the derived index; all source rows and metadata remain untouched.
-- Freed pages are reusable; do not VACUUM on application startup.
DROP TABLE IF EXISTS clipboard_fts;
