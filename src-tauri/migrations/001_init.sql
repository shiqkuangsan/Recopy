-- Recopy initial schema

-- Main clipboard items table
CREATE TABLE IF NOT EXISTS clipboard_items (
    id              TEXT PRIMARY KEY NOT NULL,
    content_type    TEXT NOT NULL CHECK(content_type IN ('plain_text', 'rich_text', 'image', 'file')),
    plain_text      TEXT NOT NULL DEFAULT '',
    rich_content    BLOB,
    thumbnail       BLOB,
    image_path      TEXT,
    file_path       TEXT,
    file_name       TEXT NOT NULL DEFAULT '',
    source_app      TEXT NOT NULL DEFAULT '',
    source_app_name TEXT NOT NULL DEFAULT '',
    content_size    INTEGER NOT NULL DEFAULT 0,
    content_hash    TEXT NOT NULL,
    is_favorited    BOOLEAN NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_clipboard_items_created_at ON clipboard_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clipboard_items_content_type ON clipboard_items(content_type);
CREATE INDEX IF NOT EXISTS idx_clipboard_items_content_hash ON clipboard_items(content_hash);
CREATE INDEX IF NOT EXISTS idx_clipboard_items_is_favorited ON clipboard_items(is_favorited);

-- FTS5 virtual table for full-text search (trigram tokenizer for Chinese support)
-- Using standalone mode (not external content) for reliability.
-- Sync is managed by Rust code on insert/update/delete.
CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_fts USING fts5(
    item_id UNINDEXED,
    plain_text,
    file_name,
    source_app_name,
    tokenize='trigram'
);

-- Groups table
CREATE TABLE IF NOT EXISTS groups (
    id          TEXT PRIMARY KEY NOT NULL,
    name        TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Item-Group association (many-to-many)
CREATE TABLE IF NOT EXISTS item_groups (
    item_id     TEXT NOT NULL REFERENCES clipboard_items(id) ON DELETE CASCADE,
    group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, group_id)
);

-- Settings table (key-value store)
CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY NOT NULL,
    value       TEXT NOT NULL
);

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('shortcut', 'CommandOrControl+Shift+V'),
    ('auto_start', 'false'),
    ('theme', 'dark'),
    ('language', 'system'),
    ('retention_policy', 'unlimited'),
    ('retention_days', '0'),
    ('retention_count', '0'),
    ('max_item_size_mb', '10'),
    ('close_on_blur', 'true');
