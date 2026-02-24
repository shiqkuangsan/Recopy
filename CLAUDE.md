# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm tauri dev              # Start full Tauri dev (Vite + Rust, hot-reload)

# Frontend tests (Vitest + jsdom)
npx vitest run              # Run once
npx vitest                  # Watch mode

# Rust tests
cd src-tauri && cargo test  # All backend tests

# Type checking
npx tsc --noEmit            # TypeScript check only

# Build
pnpm tauri build            # Production build (DMG on macOS, NSIS on Windows)
```

## Architecture

Tauri v2 desktop app: **React 19 frontend** communicating with **Rust backend** via IPC commands.

### Frontend → Backend Communication

- Frontend calls Rust via `invoke("command_name", { args })` from `@tauri-apps/api/core`
- Rust emits events to frontend via `app.emit("event-name", payload)` — frontend listens with `listen()`
- Key events: `"clipboard-changed"` (triggers UI refresh), `"easycv-show"` (panel visibility)

### Backend (src-tauri/src/)

| Module | Purpose |
|--------|---------|
| `lib.rs` | App setup: plugin registration, window management, global shortcut (Cmd+Shift+V), clipboard monitor spawn |
| `commands/clipboard.rs` | All Tauri IPC commands: CRUD, paste, favorites, settings |
| `db/` | SQLite via SQLx — `models.rs` (types), `queries.rs` (SQL), `mod.rs` (pool init + migrations) |
| `clipboard/mod.rs` | Utilities: SHA-256 hashing, thumbnail generation (400px), original image storage |
| `platform/macos.rs` | NSPanel integration — floating non-activating panel, main-thread dispatch for AppKit |
| `platform/fallback.rs` | Stubs for non-macOS platforms |

### Frontend (src/)

| Module | Purpose |
|--------|---------|
| `App.tsx` | Router (history page vs settings page via `?page=settings` param) |
| `stores/` | Zustand stores — `clipboard-store` (items, search, filters), `settings-store` (theme, preferences), `toast-store` |
| `components/` | UI: ClipboardList, SearchBar, FilterBar, TextCard/ImageCard/FileCard/RichTextCard, ContextMenu, SettingsPage |
| `hooks/useKeyboardNav.ts` | Arrow keys, Enter (paste), Cmd+C (copy), keyboard navigation |
| `lib/paste.ts` | `pasteItem()` / `copyToClipboard()` — invokes Rust paste commands |
| `i18n/` | react-i18next config + locale JSONs (zh, en) |

### Paste Flow (critical path)

1. User presses Enter → `pasteItem(item)` → `invoke("paste_clipboard_item")`
2. Rust writes content to system clipboard (text/image/file/rich_text)
3. `platform_resign_before_paste()` — **sync** main-thread dispatch (NSPanel resigns key window)
4. `simulate_paste()` — osascript Cmd+V with 50ms delay
5. `platform_hide_window()` — **async** main-thread dispatch (avoids deadlock from blur handler)

### NSPanel (macOS)

The main window is converted to NSPanel for non-activating floating behavior. **All AppKit operations must run on the main thread** — Tauri commands execute on tokio worker threads, so `app.run_on_main_thread()` is required. `platform_resign_before_paste` uses `sync_channel` for synchronous waiting; `platform_hide_window` is fire-and-forget to avoid deadlock when called from the blur event handler (which already runs on main thread).

### Data Model

```
ClipboardItem: id (UUID), content_type (plain_text|rich_text|image|file),
  plain_text, rich_content?, thumbnail? (binary), image_path? (original file),
  file_path?, file_name?, source_app, source_app_name,
  content_size, content_hash (SHA-256), is_favorited, created_at, updated_at
```

- Images: original saved to `app_data/images/YYYY-MM/{uuid}.png`, thumbnail (400px) stored as blob in DB
- Dedup: SHA-256 hash check before insert — duplicates bump `updated_at` instead

### Theme System

- Tailwind CSS v4 with `@theme` custom properties in `src/index.css`
- `html[data-theme="light"|"dark"]` controls active palette
- Persisted to DB `settings` table, default follows system `prefers-color-scheme`

### i18n

- react-i18next: `src/i18n/index.ts`, locales at `src/i18n/locales/{zh,en}.json`
- System language detection + manual override, persisted to DB

## Key Conventions

- **Tailwind v4**: Uses `@theme` directive for tokens, `dark:` variant tied to `data-theme` attribute (not `class="dark"`)
- **State**: Zustand stores — no Redux, no React Query. Direct `invoke()` calls for data fetching
- **UI primitives**: Radix UI (dialog, tabs, popover, context-menu) + Lucide icons
- **Rust errors**: Commands return `Result<T, String>` — errors serialized as strings to frontend
- **Database**: SQLx with runtime query checking, SQLite WAL mode, async pool (max 5 connections)
- **Platform code**: Gated with `#[cfg(target_os = "macos")]` and separate `platform/` modules
- **Virtual scrolling**: `@tanstack/react-virtual` for clipboard list performance
- **Window setup**: Main panel 380px height, full screen width, positioned at bottom. Settings window 560x480 centered

## CI

GitHub Actions on push to main + PRs:
- Frontend: `tsc --noEmit` + `vitest run`
- Rust: `cargo test` + `cargo check` per target
- Build matrix: macOS (aarch64, x86_64) + Windows (x64)
- Release: version tags trigger DMG + NSIS bundle creation
