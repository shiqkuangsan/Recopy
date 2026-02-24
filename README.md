# Recopy

A free, open-source clipboard history manager for macOS and Windows.

> Every copy you make, always within reach.

English | [中文](README.zh-CN.md)

## Features

- **Full-type support** — Plain text, rich text, images, and files
- **Instant recall** — `Cmd+Shift+V` to summon, arrow keys to navigate, Enter to paste
- **Smart dedup** — SHA-256 hash prevents duplicate entries
- **Full-text search** — FTS5 with trigram tokenizer for Chinese/English fuzzy search
- **Favorites** — Pin frequently used items for quick access
- **Non-activating panel** — NSPanel on macOS, never steals focus from your active app
- **Themes** — Dark and light mode, follows system preference
- **i18n** — Chinese and English, auto-detects system language
- **Privacy first** — All data stored locally in SQLite, nothing leaves your machine

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Tauri v2](https://v2.tauri.app) |
| Frontend | React 19 + TypeScript + Tailwind CSS v4 |
| Backend | Rust |
| Database | SQLite (SQLx, WAL mode) |
| State | Zustand |
| UI | Radix UI + Lucide Icons |
| i18n | react-i18next |
| Platform | NSPanel (macOS), virtual scrolling (@tanstack/react-virtual) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 10+
- [Rust](https://rustup.rs/) 1.77+
- Xcode Command Line Tools (macOS) or Visual Studio Build Tools (Windows)

### Development

```bash
# Install dependencies
pnpm install

# Start dev server (Vite + Rust hot-reload)
pnpm tauri dev

# Run tests
npx vitest run          # Frontend (17 tests)
cd src-tauri && cargo test  # Backend (19 tests)

# Type check
npx tsc --noEmit

# Production build
pnpm tauri build
```

### Build Output

| Platform | Format |
|----------|--------|
| macOS | `.dmg` |
| Windows | NSIS installer |

## Architecture

```
Recopy
├── src/                  # React frontend
│   ├── components/       # UI components (cards, search, filters)
│   ├── stores/           # Zustand state management
│   ├── hooks/            # Keyboard navigation, shortcuts
│   └── i18n/             # Locale files (zh, en)
├── src-tauri/
│   └── src/
│       ├── lib.rs        # App setup, tray, shortcuts, clipboard monitor
│       ├── commands/     # Tauri IPC commands (CRUD, paste, settings)
│       ├── db/           # SQLite models, queries, migrations
│       ├── clipboard/    # Hashing, thumbnails, image storage
│       └── platform/     # macOS NSPanel / Windows fallback
└── docs/                 # PRD, tech selection, wireframes
```

### Paste Flow

1. User presses Enter on a clipboard item
2. Rust writes content to system clipboard
3. NSPanel resigns key window (returns focus to previous app)
4. `osascript` simulates Cmd+V with 50ms delay
5. Panel hides — user sees content pasted seamlessly

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Cmd+Shift+V` | Toggle Recopy panel |
| `↑` `↓` | Navigate items |
| `Enter` | Paste selected item |
| `Cmd+C` | Copy to clipboard (without paste) |
| `Escape` | Close panel |
| `Cmd+F` | Focus search |

## Roadmap

- [ ] Source app detection (show which app content was copied from)
- [ ] App exclusion list (skip password managers, etc.)
- [ ] Configurable size limits
- [ ] Tray menu i18n
- [ ] Auto-update

## License

[MIT](LICENSE)
