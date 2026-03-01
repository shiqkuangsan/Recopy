# Mac App Store Compatibility

## Overview

Recopy uses NSPanel for its floating, non-activating clipboard panel — a core UX requirement. The original implementation relied on `tauri-nspanel`, a third-party plugin that hard-codes `tauri/macos-private-api` as a Cargo dependency. This forces wry (Tauri's WebView layer) to compile with `drawsBackground` KVC — a private API string that Apple's automated scanner detects and rejects during App Store review.

This document describes the dual-track build architecture that enables both DMG distribution (full visual effects) and Mac App Store distribution (clean binary, no private APIs) from a single codebase.

## The Problem

### Private API Chain

```
tauri-nspanel (Cargo.toml)
  → requires tauri/macos-private-api feature
    → wry compiles with `transparent` feature
      → calls [WKWebView setValue:forKey:@"drawsBackground"]
        → Apple static analysis detects "drawsBackground" string
          → App Store rejection
```

The `drawsBackground` KVC is the **only** API gated behind `tauri/macos-private-api`. It enables WKWebView transparency, which allows the NSVisualEffectView behind it to show through — producing the frosted glass effect.

### What tauri-nspanel Does

`tauri-nspanel` provides ObjC runtime class swizzling (`object_setClass`) to convert Tauri's NSWindow into NSPanel subclasses with custom behavior (floating, non-activating, key window control). The plugin itself doesn't use any private APIs — but its Cargo.toml unconditionally enables `tauri/macos-private-api` because it needs `ns_window()` access, which it incorrectly assumed was behind the feature gate.

**Key finding**: `ns_window()` is a public Tauri API. It is NOT gated behind `macos-private-api`. The feature gate only controls wry's `drawsBackground` KVC call.

## Solution Architecture

### Built-in NSPanel Module

Replace `tauri-nspanel` with an internal `src/platform/nspanel.rs` module that provides the same isa-swizzling functionality without forcing private API dependencies.

```
src-tauri/src/platform/
├── mod.rs          # Platform abstraction
├── macos.rs        # macOS panel management, paste simulation
├── nspanel.rs      # Built-in NSPanel (replaces tauri-nspanel)
└── fallback.rs     # Stubs for non-macOS
```

#### NSPanel Subclasses

Two custom NSPanel subclasses defined via `objc2::define_class!`:

| Class | canBecomeKey | canBecomeMain | isFloating | Used by |
|-------|-------------|---------------|------------|---------|
| `RawRecopyPanel` | true | false | true | Main window, HUD |
| `RawPreviewPanel` | false | false | true | Quick Look preview |

#### Key Components

- **`PanelHandle`** — wraps `Retained<NSPanel>` with show/hide/setLevel/setStyleMask methods
- **`PanelStore`** — `Mutex<HashMap<String, Arc<PanelHandle>>>`, managed as Tauri state
- **`PanelExt`** trait — `AppHandle::get_panel(label)` extension method
- **`EventHandler`** — NSWindowDelegate for focus events (become_key / resign_key callbacks)
- **`convert_to_panel()`** — performs `object_setClass` runtime class swizzling

### Cargo Feature Isolation

```toml
[features]
default = ["self-update", "private-api"]
self-update = ["tauri-plugin-updater", "tauri-plugin-process"]
private-api = ["tauri/macos-private-api"]
app-store = []

[dependencies]
tauri = { version = "2", features = ["tray-icon", "image-png", "protocol-asset"] }
# Note: macos-private-api is NOT in the base tauri features
```

| Feature | DMG Build | App Store Build |
|---------|-----------|-----------------|
| `private-api` | ✅ enabled (default) | ❌ excluded |
| `self-update` | ✅ enabled (default) | ❌ excluded |
| `app-store` | ❌ | ✅ enabled |

The `self-update` feature gates the in-app auto-update mechanism (`tauri-plugin-updater` + `tauri-plugin-process`), which checks GitHub Releases for new versions and provides inline download/restart UI via `UpdateBanner` in the title bar. App Store builds exclude this per Apple App Review Guidelines 2.4.5 — the App Store handles updates natively. See `src/stores/update-store.ts` and `src/components/UpdateBanner.tsx` for implementation.

### Build Commands

```bash
# DMG (default — full visual effects + self-update)
pnpm tauri build

# App Store (no private APIs, no self-update)
pnpm tauri build \
  --config src-tauri/tauri.appstore.conf.json \
  --no-bundle \
  -- --no-default-features --features app-store
```

## Visual Strategy

### DMG Build

Full frosted glass via private API chain:

```
tauri/macos-private-api → wry drawsBackground KVC
  → WKWebView becomes transparent
    → NSVisualEffectView shows through
      → Frosted glass effect ✅
```

### App Store Build

No public API can fully replace `drawsBackground` for WKWebView transparency. The alternatives we investigated:

| API | Type | Result |
|-----|------|--------|
| `setUnderPageBackgroundColor: clearColor` | Public (macOS 12+) | Only affects "under page" area, not content rendering |
| `setOpaque: NO` | Public | Tells compositor view isn't opaque, but WKWebView still paints white |
| `NSVisualEffectView` + `windowEffects` | Public | Effect layer exists but WKWebView covers it opaquely |
| `drawsBackground` KVC | **Private** | The only way to make WKWebView truly transparent |

**Decision**: Use themed solid backgrounds via CSS fallback instead of attempting broken transparency.

#### CSS Fallback Mechanism

1. Rust backend detects App Store build (`#[cfg(not(feature = "private-api"))]`)
2. After 500ms delay (waiting for WKWebView view hierarchy), injects `data-no-vibrancy` attribute via `window.eval()`
3. CSS rule applies themed solid background:

```css
html[data-no-vibrancy],
html[data-no-vibrancy] body {
  background-color: var(--color-background);
}
```

4. Result: clean themed dark/light background that respects the user's theme preference

The 500ms delay is necessary because wry's `WryWebView` (WKWebView subclass) is not in the view hierarchy during Tauri's `setup()` closure. The deferred approach spawns a thread, sleeps, then dispatches to the main thread.

### App Store Config Overrides

`tauri.appstore.conf.json` overlays the base config:

- `macOSPrivateApi: false` (already false in base, but explicit)
- `transparent: false` — no window transparency attempt
- No `windowEffects` — no vibrancy configuration
- `createUpdaterArtifacts: false` — no self-update signing

## Binary Verification

App Store binary must not contain private API strings:

```bash
# Should return empty (no matches)
strings target/release/recopy | grep -i "drawsBackground"
```

Verified: the App Store release binary contains zero references to `drawsBackground`.

## Panel Behavior

NSPanel behavior is **identical** between DMG and App Store builds. The `nspanel.rs` module uses only public APIs:

- `object_setClass` — ObjC runtime function (public)
- `ns_window()` — Tauri public API
- `NSPanel` superclass methods — public AppKit
- `NSWindowDelegate` protocol — public AppKit
- `orderFrontRegardless` / `resignKeyWindow` — public AppKit
- Window level, style mask, collection behavior — public AppKit

The only difference is visual: DMG gets frosted glass, App Store gets solid themed background.

## Files Changed

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Remove `tauri-nspanel`, add `private-api` feature, expand objc2 features |
| `src-tauri/Cargo.lock` | Remove tauri-nspanel package tree |
| `src-tauri/src/platform/nspanel.rs` | **New** — built-in NSPanel module (429 lines) |
| `src-tauri/src/platform/mod.rs` | Add `pub mod nspanel` |
| `src-tauri/src/platform/macos.rs` | Migrate from tauri-nspanel API + add App Store transparency logic |
| `src-tauri/src/lib.rs` | Add conditional `deferred_webview_transparency` call |
| `src-tauri/tauri.conf.json` | `macOSPrivateApi: false` |
| `src-tauri/tauri.appstore.conf.json` | Opaque window config, no windowEffects |
| `src/index.css` | `data-no-vibrancy` CSS fallback |

## Key Learnings

1. **`ns_window()` is public** — tauri-nspanel's dependency on `macos-private-api` was unnecessary for its core functionality
2. **wry uses `WryWebView`** — a WKWebView subclass, so class matching must use `isKindOfClass:` not exact name comparison
3. **WebView timing** — wry's WebView is not in the NSView hierarchy during `setup()`, requiring deferred execution for any view manipulation
4. **No public transparency path** — `underPageBackgroundColor` + `setOpaque` cannot replace `drawsBackground` for content-area transparency. CSS fallback is the pragmatic solution
5. **objc2 0.6 patterns** — `define_class!` requires `#[unsafe(method(...))]` syntax, `MainThreadOnly` types need `MainThreadMarker` for `alloc()`, `DefinedClass` trait must be imported for `ivars()` access
