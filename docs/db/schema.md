# 数据库 Schema

SQLite 数据库 (`recopy.db`)，通过 SQLx 管理，使用 WAL 日志模式。

- 连接池：最大 5 个连接
- 迁移文件：`src-tauri/migrations/`
- Rust 模块：`src-tauri/src/db/`（`mod.rs` 连接池初始化，`models.rs` 类型定义，`queries.rs` SQL 查询）

## ER 关系图

```
┌──────────────────────┐       ┌──────────────────┐       ┌──────────────┐
│   clipboard_items    │       │   item_groups     │       │    groups    │
│──────────────────────│       │──────────────────│       │──────────────│
│ id (PK)              │◄──FK──│ item_id (PK,FK)  │──FK──►│ id (PK)      │
│ content_type         │       │ group_id (PK,FK)  │       │ name         │
│ plain_text           │       └──────────────────┘       │ sort_order   │
│ rich_content         │                                   │ created_at   │
│ thumbnail            │       ┌──────────────────┐       └──────────────┘
│ image_path           │       │  clipboard_fts   │
│ file_path            │       │──────────────────│
│ file_name            │◄─sync─│ item_id          │
│ source_app           │       │ plain_text       │
│ source_app_name      │       │ file_name        │
│ content_size         │       │ source_app_name  │
│ content_hash         │       └──────────────────┘
│ is_favorited         │
│ created_at           │       ┌──────────────────┐
│ updated_at           │       │    settings      │
└──────────────────────┘       │──────────────────│
                               │ key (PK)         │
                               │ value            │
                               └──────────────────┘
```

---

## 表结构

### clipboard_items

剪贴板历史记录主表，存储所有复制过的内容。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PK, NOT NULL | UUID v4 主键 |
| `content_type` | TEXT | NOT NULL, CHECK | 内容类型：`plain_text` \| `rich_text` \| `image` \| `file` |
| `plain_text` | TEXT | NOT NULL, DEFAULT `''` | 文本内容（图片类型时为空） |
| `rich_content` | BLOB | 可空 | 富文本 RTF/HTML 二进制数据 |
| `thumbnail` | BLOB | 可空 | 400px 缩略图 PNG |
| `image_path` | TEXT | 可空 | 原图文件路径（`app_data/images/YYYY-MM/{uuid}.png`） |
| `file_path` | TEXT | 可空 | 源文件路径（file 类型使用） |
| `file_name` | TEXT | NOT NULL, DEFAULT `''` | 显示用文件名 |
| `source_app` | TEXT | NOT NULL, DEFAULT `''` | 来源应用 Bundle ID（如 `com.apple.Safari`） |
| `source_app_name` | TEXT | NOT NULL, DEFAULT `''` | 来源应用显示名（如 `Safari`） |
| `content_size` | INTEGER | NOT NULL, DEFAULT `0` | 内容大小（字节） |
| `content_hash` | TEXT | NOT NULL | SHA-256 哈希，用于去重 |
| `is_favorited` | BOOLEAN | NOT NULL, DEFAULT `0` | 是否收藏 |
| `created_at` | TEXT | NOT NULL, DEFAULT `datetime('now')` | 创建时间（ISO 8601） |
| `updated_at` | TEXT | NOT NULL, DEFAULT `datetime('now')` | 更新时间（去重时会刷新） |

**索引：**

| 索引名 | 字段 | 用途 |
|--------|------|------|
| `idx_clipboard_items_created_at` | `created_at DESC` | 按日期清理过期记录 |
| `idx_clipboard_items_content_type` | `content_type` | 按类型筛选 |
| `idx_clipboard_items_content_hash` | `content_hash` | 快速去重查找 |
| `idx_clipboard_items_is_favorited` | `is_favorited` | 收藏列表查询 |

**去重机制：** 新内容进入时先计算 SHA-256 哈希，通过 `find_and_bump_by_hash` 查找是否已存在。若存在，只刷新 `updated_at` 到当前时间，不重复插入。

---

### clipboard_fts

FTS5 全文搜索虚拟表，使用 trigram 分词器（支持中日韩字符）。

| 字段 | 类型 | 是否索引 | 说明 |
|------|------|----------|------|
| `item_id` | TEXT | UNINDEXED | 关联 `clipboard_items.id`（不参与搜索） |
| `plain_text` | TEXT | 是 | 可搜索的文本内容 |
| `file_name` | TEXT | 是 | 可搜索的文件名 |
| `source_app_name` | TEXT | 是 | 可搜索的来源应用名 |

**说明：**
- 独立 FTS 表（非 external content 模式）——数据冗余存储，保证可靠性
- 数据同步由 Rust 代码管理：对 `clipboard_items` 的增删操作必须同步更新本表
- trigram 分词器要求最少 3 个字符；更短的查询会降级为 `LIKE` 模糊搜索
- 所有增删操作都与主表包裹在同一个事务中

---

### groups

分组定义表，用于整理剪贴板条目（预留功能，暂未启用）。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PK, NOT NULL | UUID v4 主键 |
| `name` | TEXT | NOT NULL | 分组显示名 |
| `sort_order` | INTEGER | NOT NULL, DEFAULT `0` | 自定义排序位置 |
| `created_at` | TEXT | NOT NULL, DEFAULT `datetime('now')` | 创建时间 |

---

### item_groups

剪贴板条目与分组的多对多关联表。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `item_id` | TEXT | PK, FK → `clipboard_items.id`, ON DELETE CASCADE | 条目引用 |
| `group_id` | TEXT | PK, FK → `groups.id`, ON DELETE CASCADE | 分组引用 |

**级联删除：** 当关联的条目或分组被删除时，本表对应行会通过外键约束自动删除。批量删除操作中也会在事务内显式清理。

---

### settings

应用设置表，键值对存储。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `key` | TEXT | PK, NOT NULL | 设置项标识 |
| `value` | TEXT | NOT NULL | 设置值（统一存为字符串） |

**默认值（由迁移脚本插入）：**

| 键名 | 默认值 | 说明 |
|------|--------|------|
| `shortcut` | `CommandOrControl+Shift+V` | 全局快捷键 |
| `auto_start` | `false` | 开机自启 |
| `theme` | `dark` | 主题：`dark` \| `light` \| `system` |
| `language` | `system` | 语言：`en` \| `zh` \| `system` |
| `retention_policy` | `unlimited` | 保留策略：`unlimited` \| `days` \| `count` |
| `retention_days` | `0` | 保留天数（策略为 `days` 时生效） |
| `retention_count` | `0` | 保留条数（策略为 `count` 时生效） |
| `max_item_size_mb` | `10` | 单条最大体积限制（1–100 MB） |
| `close_on_blur` | `true` | 失焦时自动隐藏面板 |

**写入方式：** `set_setting` 使用 `INSERT ... ON CONFLICT(key) DO UPDATE` 实现原子 upsert。

---

## 事务

4 个函数使用显式事务保证多表操作的原子性：

| 函数 | 涉及表 | 用途 |
|------|--------|------|
| `insert_item` | `clipboard_items` + `clipboard_fts` | 插入记录 + 同步搜索索引 |
| `delete_item` | `clipboard_fts` + `clipboard_items` | 删除记录 + 清理搜索索引 |
| `clear_history` | `clipboard_fts` + `item_groups` + `clipboard_items` | 批量删除非收藏记录 |
| `cleanup_by_retention` | `clipboard_fts` + `item_groups` + `clipboard_items` | 按保留策略清理过期记录 |

**模式：** `pool.begin()` → `.execute(&mut *tx)` → `tx.commit()`。中途任何步骤失败，`tx` 被 drop 时自动回滚。

---

## Rust 类型映射

| Rust 类型 (`models.rs`) | 数据库列类型 | 备注 |
|--------------------------|-------------|------|
| `String` | TEXT | UUID、时间戳、枚举值 |
| `Option<String>` | TEXT（可空） | `image_path`、`file_path`、`file_name` |
| `Option<Vec<u8>>` | BLOB（可空） | `rich_content`、`thumbnail` |
| `i64` | INTEGER | `content_size` |
| `bool` | BOOLEAN (INTEGER 0/1) | `is_favorited` |
| `ContentType` enum | TEXT | 通过 `as_str()` / `from_str()` 序列化 |

---

## 迁移历史

| 文件 | 说明 |
|------|------|
| `001_init.sql` | 初始 schema：全部表、索引、FTS5 虚拟表、默认设置 |
