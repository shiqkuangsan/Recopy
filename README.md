# Recopy

[![GitHub Release](https://img.shields.io/github/v/release/shiqkuangsan/Recopy)](https://github.com/shiqkuangsan/Recopy/releases)
[![GitHub Downloads](https://img.shields.io/github/downloads/shiqkuangsan/Recopy/total)](https://github.com/shiqkuangsan/Recopy/releases)
[![GitHub Stars](https://img.shields.io/github/stars/shiqkuangsan/Recopy)](https://github.com/shiqkuangsan/Recopy/stargazers)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/shiqkuangsan/Recopy)](https://github.com/shiqkuangsan/Recopy/commits)
[![License](https://img.shields.io/badge/license-PolyForm%20NC%201.0-blue)](LICENSE)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri-ffc131)](https://v2.tauri.app)
[![macOS](https://img.shields.io/badge/macOS-supported-brightgreen)](https://github.com/shiqkuangsan/Recopy/releases)
[![Windows](https://img.shields.io/badge/Windows-supported-brightgreen)](https://github.com/shiqkuangsan/Recopy/releases)

A free, source-available clipboard history manager for macOS and Windows.

> Every copy you make, always within reach.

English | [中文](README.zh-CN.md)

### Dark Mode
![Recopy — Dark Mode](assets/screenshots/dark-main-en.png)

<details>
<summary>More screenshots</summary>

### Light Mode
![Recopy — Light Mode](assets/screenshots/light-main-en.png)

### Quick Look Preview
![Quick Look Preview](assets/screenshots/dark-preview-en.png)

</details>

## Installation

### Homebrew (macOS)

```bash
brew install --cask shiqkuangsan/recopy/recopy

# update to latest version
brew upgrade --cask recopy
```

### Manual Download

Download the latest `.dmg` or `.exe` from the [Releases](https://github.com/shiqkuangsan/Recopy/releases) page.

> [!IMPORTANT]
> **macOS users:** Recopy is not code-signed yet. macOS will show **"app is damaged"** or **"cannot be opened"** on first launch. This is normal — just run this command in Terminal to fix it:
>
> ```bash
> xattr -d com.apple.quarantine /Applications/Recopy.app
> ```
>
> Or right-click the app → Open → click "Open" in the dialog. You only need to do this once.
>
> See the [full macOS installation guide](docs/macos-unsigned-app.md) for more details.

## Features

- **Full-type support** — Plain text, rich text, images, files, and links
- **Instant recall** — `Cmd/Ctrl+Shift+V` to summon, arrow keys to navigate, Enter to paste, `Cmd/Ctrl+1–9` for quick paste
- **Quick Look preview** — Press Space to preview any item with Finder-style zoom animation
- **Flexible layout** — Panel docks to any screen edge (bottom/top/left/right), with grouped or single-row browsing for top/bottom layouts
- **Smart dedup** — SHA-256 hash prevents duplicate entries, bumps latest to top
- **Ranked fuzzy search** — Multi-keyword AND matching across text, file names, and source apps; exact and ordered matches rise to the top
- **Link detection** — URLs auto-recognized with dedicated cards, `Cmd+Click` to open in browser
- **IME friendly** — Search works correctly with Chinese input methods (composition-aware)
- **Favorites** — Pin frequently used items from the card, context menu, or `F`; favorites are protected from cleanup
- **Non-activating panel** — NSPanel on macOS plus foreground restore and keyboard hook on Windows — never steals focus from your active app
- **Copy HUD** — Frosted glass feedback overlay when copying to clipboard
- **Auto-update** — Built-in update checker with in-app download and one-click restart
- **Configurable** — Theme, language, shortcut, tray icon, panel position, selected item on open, single-row mode, auto-start, retention policy
- **Privacy first** — Clipboard data stays local in SQLite; only update checks/downloads contact release endpoints

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Cmd/Ctrl+Shift+V` | Toggle Recopy panel (customizable in settings) |
| `←` `→` / `↑` `↓` | Navigate items and date groups based on panel layout |
| `Enter` | Paste selected item |
| `Space` | Quick Look preview |
| `Cmd/Ctrl+1` ... `9` | Quick paste one of the visible targets |
| `Cmd/Ctrl+C` | Copy to clipboard (with HUD feedback) |
| `Cmd/Ctrl+F` | Focus search |
| `F` | Favorite / unfavorite selected item |
| `Tab` | Switch between History and Pins |
| `Cmd/Ctrl+[` / `Cmd/Ctrl+]` | Switch to previous / next type filter |
| `Cmd/Ctrl+↑` | Select the first item |
| `Cmd/Ctrl+←` | Select the first item in the current group (top/bottom layouts) |
| `Cmd/Ctrl+,` | Open settings |
| `Delete` / `Backspace` | Delete selected item |
| `Escape` | Close panel / blur search |

## Settings

Open settings via the gear icon in the panel header, tray menu, or `Cmd/Ctrl+,`.

- **General** — Theme (dark/light/system), language (en/zh/system), global shortcut, panel position (bottom/top/left/right), selected item on open, single-row mode, tray icon, auto-start, close-on-blur
- **History** — Retention policy (unlimited/days/count), max item size (1–100 MB), storage used, clear history while preserving favorites
- **Privacy** — Accessibility permission guide, app exclusion list (coming soon)
- **About** — Version, update check interval, links, license, Homebrew status, quit action

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
| Platform | NSPanel (macOS), keyboard hook (Windows), virtual scrolling (@tanstack/react-virtual) |

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
│       └── platform/     # macOS NSPanel + HUD / Windows non-activating window + keyboard hook
└── website/              # Landing page
```

### Paste Flow

**macOS:**
1. User presses Enter on a clipboard item
2. Rust writes content to system clipboard
3. NSPanel resigns key window (returns focus to previous app)
4. `osascript` simulates Cmd+V with 50ms delay
5. Panel hides — user sees content pasted seamlessly

**Windows:**
1. User presses Enter on a clipboard item
2. Rust writes content to system clipboard
3. Window hides and restores previous foreground app
4. `SendInput` simulates Ctrl+V with 50ms delay
5. Content pasted into the still-focused app

## License

[PolyForm Noncommercial 1.0.0](LICENSE)
