# Recopy

A free, open-source clipboard history manager. macOS tested, Windows support in progress.

> Every copy you make, always within reach.

English | [中文](README.zh-CN.md)

![Recopy Preview](assets/preview.png)

## Features

- **Full-type support** — Plain text, rich text, images, and files
- **Instant recall** — `Cmd+Shift+V` to summon, arrow keys to navigate, Enter to paste
- **Smart dedup** — SHA-256 hash prevents duplicate entries, bumps latest to top
- **Full-text search** — FTS5 with trigram tokenizer for Chinese/English fuzzy search
- **IME friendly** — Search works correctly with Chinese input methods (composition-aware)
- **Favorites** — Pin frequently used items for quick access
- **Non-activating panel** — NSPanel on macOS, never steals focus from your active app
- **Copy HUD** — Frosted glass feedback overlay when copying to clipboard
- **Configurable settings** — Theme, language, shortcut, auto-start, retention policy, and more
- **Themes** — Dark and light mode, follows system preference
- **i18n** — Chinese and English, auto-detects system language (including tray menu)
- **Lazy thumbnails** — Async thumbnail generation, no blocking on panel open
- **Privacy first** — All data stored locally in SQLite, nothing leaves your machine

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Cmd+Shift+V` | Toggle Recopy panel (customizable in settings) |
| `←` `→` | Navigate between items |
| `↑` `↓` | Jump between date groups |
| `Enter` | Paste selected item |
| `Cmd+C` | Copy to clipboard (with HUD feedback) |
| `Cmd+F` | Focus search |
| `Cmd+,` | Open settings |
| `Escape` | Close panel / blur search |

## Settings

Open settings via the gear icon in the panel header, tray menu, or `Cmd+,`.

- **General** — Theme (dark/light/system), language (en/zh/system), global shortcut, auto-start, close-on-blur
- **History** — Retention policy (unlimited/days/count), max item size (1–100 MB), clear history
- **Privacy** — Accessibility permission guide, app exclusion list (coming soon)
- **About** — Version, license, tech stack

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
npx vitest run             # Frontend
cd src-tauri && cargo test # Backend

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
│   ├── components/       # UI components (cards, search, filters, settings)
│   ├── stores/           # Zustand state management
│   ├── hooks/            # Keyboard navigation, thumbnail lazy-loading
│   └── i18n/             # Locale files (zh, en)
├── src-tauri/
│   └── src/
│       ├── lib.rs        # App setup, tray (i18n), shortcuts, clipboard monitor
│       ├── commands/     # Tauri IPC commands (CRUD, paste, settings, shortcuts)
│       ├── db/           # SQLite models, queries, migrations
│       ├── clipboard/    # Hashing, thumbnails (async), image storage
│       └── platform/     # macOS NSPanel + HUD / Windows fallback
└── website/              # Landing page
```

### Paste Flow

1. User presses Enter on a clipboard item
2. Rust writes content to system clipboard
3. NSPanel resigns key window (returns focus to previous app)
4. `osascript` simulates Cmd+V with 50ms delay
5. Panel hides — user sees content pasted seamlessly

## Roadmap

- [ ] Source app detection (show which app content was copied from)
- [ ] App exclusion list (skip password managers, etc.)
- [ ] Auto-update (Sparkle / tauri-plugin-updater)

## License

[MIT](LICENSE)
