-- User metadata is independent of clipboard content and recency.
ALTER TABLE clipboard_items ADD COLUMN note_title TEXT NOT NULL DEFAULT '';
