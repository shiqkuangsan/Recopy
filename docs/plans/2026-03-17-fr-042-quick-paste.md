# FR-042 Quick Paste Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `Cmd/Ctrl+1..9` quick paste with modifier badges, using selected-group numbering in grouped mode and first-nine numbering in flat mode.

**Architecture:** Keep keyboard event ownership inside `useKeyboardNav`, move modifier state into `clipboard-store`, and compute quick-paste targets from pure helper logic so grouped/flat behavior can be tested without rendering the virtualized list. UI consumes `modifierHeld` plus per-card `quickIndex`.

**Tech Stack:** React 19, Zustand, Vitest, Testing Library, TanStack React Virtual

---

### Task 1: Define quick-paste scope in a pure helper

**Files:**
- Create: `/Users/zhuguidong/WorkSpace/PrivateSpace/Recopy/src/lib/quick-paste.ts`
- Create: `/Users/zhuguidong/WorkSpace/PrivateSpace/Recopy/src/lib/__tests__/quick-paste.test.ts`

**Step 1: Write the failing test**

- Cover grouped mode: selected item determines target group.
- Cover flat mode: first nine items map directly.
- Cover short groups/lists: only existing items are returned.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/__tests__/quick-paste.test.ts`

**Step 3: Write minimal implementation**

- Export helpers for grouped and flat quick-paste targets.
- Reuse `dateGroupLabel()` for grouping consistency.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/__tests__/quick-paste.test.ts`

### Task 2: Add failing keyboard tests

**Files:**
- Modify: `/Users/zhuguidong/WorkSpace/PrivateSpace/Recopy/src/hooks/__tests__/useKeyboardNav.test.ts`
- Modify: `/Users/zhuguidong/WorkSpace/PrivateSpace/Recopy/src/stores/clipboard-store.ts`

**Step 1: Write the failing test**

- Modifier keydown/keyup updates store state.
- `Cmd/Ctrl+1..9` pastes grouped targets in grouped mode.
- `Cmd/Ctrl+1..9` pastes first-nine targets in flat mode.
- Blur / hide resets modifier state.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/hooks/__tests__/useKeyboardNav.test.ts`

**Step 3: Write minimal implementation**

- Add `modifierHeld` and setter to store.
- Update `useKeyboardNav` to maintain modifier state and handle number shortcuts.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/hooks/__tests__/useKeyboardNav.test.ts`

### Task 3: Render quick-paste badges

**Files:**
- Modify: `/Users/zhuguidong/WorkSpace/PrivateSpace/Recopy/src/components/ClipboardList.tsx`
- Modify: `/Users/zhuguidong/WorkSpace/PrivateSpace/Recopy/src/components/ClipboardCard.tsx`
- Create: `/Users/zhuguidong/WorkSpace/PrivateSpace/Recopy/src/components/__tests__/ClipboardCard.test.tsx`

**Step 1: Write the failing test**

- Badge renders when `quickIndex` exists and modifier is held.
- Badge is hidden otherwise.

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/__tests__/ClipboardCard.test.tsx`

**Step 3: Write minimal implementation**

- Compute per-card `quickIndex` in `ClipboardList`.
- Render badge in `ClipboardCard`.

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/__tests__/ClipboardCard.test.tsx`

### Task 4: Regression verification

**Files:**
- Verify only

**Step 1: Run targeted tests**

Run:
- `pnpm vitest run src/lib/__tests__/quick-paste.test.ts`
- `pnpm vitest run src/hooks/__tests__/useKeyboardNav.test.ts`
- `pnpm vitest run src/components/__tests__/ClipboardCard.test.tsx`

**Step 2: Run broader frontend checks**

Run:
- `pnpm test`
- `pnpm exec tsc --noEmit`

**Step 3: Refactor only if all green**

- Remove duplication between quick-paste helpers and list rendering.
- Keep `LinkCard` modifier hint unchanged unless it conflicts with global state.
