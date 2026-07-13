# Preview Selection Copy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to select part of any text preview and copy exactly that plain-text selection with Cmd/Ctrl+C while preserving whole-item copy when no preview selection exists.

**Architecture:** The preview WebView owns DOM selection and broadcasts `{ itemId, text, generation, sequence }` through a Tauri event. A main-owned generation and Preview READY/clear-ack handshake reject stale lifecycle events and recover from WebView reloads. The main WebView caches only the current valid payload because it owns Cmd/Ctrl+C in non-activating mode, then chooses partial-text copy before the existing whole-item path. A dedicated Rust command writes raw text through the clipboard plugin without activating or hiding either window.

**Tech Stack:** React 19, TypeScript, Tauri v2 events and commands, Rust, Vitest, Testing Library.

---

### Task 1: Define the preview-selection contract

**Files:**
- Create: `src/lib/preview-selection.ts`
- Create: `src/lib/__tests__/preview-selection.test.ts`

**Step 1: Write failing tests**

Cover these behaviors:

- a selection is usable only when preview is open, item ids match, and text is non-empty;
- whitespace and line breaks are preserved exactly;
- stale or cleared selections fall back to whole-item copy.

**Step 2: Verify RED**

Run: `pnpm exec vitest run src/lib/__tests__/preview-selection.test.ts`

Expected: FAIL because the selection contract module does not exist.

**Step 3: Implement the minimal pure contract**

Export the event name, payload type, empty payload helper, and a predicate that validates a payload against the active preview/item.

**Step 4: Verify GREEN**

Run: `pnpm exec vitest run src/lib/__tests__/preview-selection.test.ts`

Expected: PASS.

### Task 2: Publish selection changes from the preview WebView

**Files:**
- Create: `src/components/__tests__/PreviewPage.test.tsx`
- Modify: `src/components/PreviewPage.tsx`

**Step 1: Write failing component tests**

Verify that:

- plain-text and rich-text preview regions opt into text selection;
- `selectionchange` emits the exact selected text with the current item id;
- selections outside the preview content emit an empty value;
- changing/unmounting the preview clears the selection.

**Step 2: Verify RED**

Run: `pnpm exec vitest run src/components/__tests__/PreviewPage.test.tsx`

Expected: FAIL because the preview does not publish selection state or opt into selection.

**Step 3: Implement the minimal publisher**

Add a selectable container ref, listen to document selection changes, ensure both selection endpoints belong to that container, and emit the contract payload. Apply `select-text` and `cursor-text` only to readable text content.

**Step 4: Verify GREEN**

Run: `pnpm exec vitest run src/components/__tests__/PreviewPage.test.tsx`

Expected: PASS.

### Task 3: Copy raw selected text

**Files:**
- Modify: `src/lib/__tests__/paste.test.ts`
- Modify: `src/lib/paste.ts`
- Modify: `src-tauri/src/commands/clipboard.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Write a failing frontend test**

Assert that `copyTextToClipboard(text)` invokes `copy_text_to_clipboard` with the exact text, including whitespace and newlines.

**Step 2: Verify RED**

Run: `pnpm exec vitest run src/lib/__tests__/paste.test.ts`

Expected: FAIL because the wrapper does not exist.

**Step 3: Implement the wrapper and command**

Add a Tauri command that rejects an empty string, sets the existing skip-next-monitor flag, writes through `tauri_plugin_clipboard_x::write_text`, clears the flag on error, and does not activate, paste, or hide a window. Register it in the invoke handler and expose a frontend wrapper.

**Step 4: Verify GREEN and Rust compilation**

Run:

- `pnpm exec vitest run src/lib/__tests__/paste.test.ts`
- `cargo +1.95.0 test`

Expected: all tests pass.

### Task 4: Give preview selection precedence on Cmd/Ctrl+C

**Files:**
- Modify: `src/hooks/__tests__/useKeyboardNav.test.ts`
- Modify: `src/hooks/useKeyboardNav.ts`

**Step 1: Write failing keyboard tests**

Verify that:

- when the preview is open and a matching non-empty selection exists, Cmd/Ctrl+C copies that text and not the whole item;
- an empty or stale selection keeps the current whole-item behavior;
- closing, hiding, or changing preview content clears stale selection;
- successful partial copy shows the existing HUD.

**Step 2: Verify RED**

Run: `pnpm exec vitest run src/hooks/__tests__/useKeyboardNav.test.ts`

Expected: FAIL because the hook ignores preview selection events.

**Step 3: Implement minimal precedence logic**

Listen for the preview-selection event, cache the payload in a ref, clear it across preview lifecycle boundaries, and branch inside the existing copy shortcut without changing other keyboard behavior.

**Step 4: Verify GREEN**

Run: `pnpm exec vitest run src/hooks/__tests__/useKeyboardNav.test.ts`

Expected: PASS.

### Task 5: Regression and cross-platform review

**Files:**
- Review: `src-tauri/src/platform/macos.rs`
- Review: `src-tauri/src/platform/windows.rs`
- Review: all changed files

**Step 1: Run formatting and static checks**

- `pnpm exec prettier --check "src/**/*.{ts,tsx}"`
- `pnpm exec eslint src/`
- `pnpm exec tsc --noEmit`
- `cargo +1.95.0 fmt --check`

**Step 2: Run full regressions**

- `pnpm exec vitest run`
- `cargo +1.95.0 test`

**Step 3: Perform an independent review**

Review System & Contracts plus Experience risks: stale cross-WebView state, exact-text preservation, copy precedence, lifecycle clearing, non-activation invariants, and Windows global-hook behavior.

**Step 4: Manual verification when a desktop session is available**

Check plain text, rich text, link, and text-file previews on macOS and Windows. Verify drag/double-click selection, Cmd/Ctrl+C, selection highlighting in both themes, no-selection fallback, preview switching, Space/Escape, and retained focus behavior.

**Step 5: Commit checkpoint**

Do not commit, push, or create a PR without explicit user authorization. When authorized, stage only files listed by this plan and use a conventional commit without AI attribution.

## Verification Results (2026-07-13)

- Targeted frontend: 107 tests passed across selection contract, PreviewPage, and keyboard navigation.
- Full frontend: 25 test files / 337 tests passed.
- Rust: 58 tests passed with toolchain 1.95.0; repository minimum 1.94.0 is newer than the local default 1.93.1.
- Static: Prettier, ESLint, TypeScript, Rust fmt, and `git diff --check` passed.
- Independent System & Contracts / Experience review: no Critical or Important findings; delivery recommended.
- Manual interaction: not completed. Computer Use could not reliably identify the macOS accessory-app NSPanel, and no Windows desktop session was available.
