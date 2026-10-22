-- image_path sits after the rich_content/thumbnail BLOBs, so a table scan for it
-- walks every blob's overflow pages. This partial covering index keeps the
-- startup orphan-image sweep off the blobs entirely.
CREATE INDEX IF NOT EXISTS idx_clipboard_items_image_path
    ON clipboard_items(image_path)
    WHERE image_path IS NOT NULL;
