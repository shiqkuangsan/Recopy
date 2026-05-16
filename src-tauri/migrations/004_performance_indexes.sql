-- Composite indexes for the panel's most common list views.
CREATE INDEX IF NOT EXISTS idx_clipboard_items_updated_at_id
    ON clipboard_items(updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_clipboard_items_content_type_updated_at_id
    ON clipboard_items(content_type, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_clipboard_items_favorited_updated_at_id
    ON clipboard_items(is_favorited, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_clipboard_items_favorited_type_updated_at_id
    ON clipboard_items(is_favorited, content_type, updated_at DESC, id DESC);
