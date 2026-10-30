-- created_at, image_path and content_hash all sit after the rich_content/thumbnail
-- BLOBs, so any plan that has to read them from the table walks blob overflow
-- pages for every candidate row.

-- Startup retention: covers the image_path lookup and narrows the DELETEs to
-- expired rows, instead of every non-favorited row via idx_clipboard_items_is_favorited.
CREATE INDEX IF NOT EXISTS idx_clipboard_items_favorited_created_at
    ON clipboard_items(is_favorited, created_at, image_path);

-- Legacy dedup fallback: equality on hash and type in the ORDER BY order, so the
-- planner no longer scans every row of a type through
-- idx_clipboard_items_content_type_updated_at_id.
CREATE INDEX IF NOT EXISTS idx_clipboard_items_hash_type_updated_at_id
    ON clipboard_items(content_hash, content_type, updated_at DESC, id DESC);
