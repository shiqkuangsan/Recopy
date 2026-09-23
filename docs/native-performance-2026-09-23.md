# Isolated native performance measurement (FR-085)

## What ran

A separate managed worktree built the current source snapshot (including pending
migration 006), using Rust debug and production Vite assets. It ran real Tauri,
NSPanel, WebKit, SQLite, IPC, Zustand and list components with 10,000 synthetic
768-byte text rows. A unique com.recopy.perf identifier isolated app data.

Clipboard plugin/capture, global shortcut registration and tray were disabled.
Paste/copy, shortcut changes, settings mutation and external-link IPC were removed.
Fixture settings disabled autostart and update checks, including cached settings.
No real history or clipboard was used. Only the fixture PID was sampled/stopped.
Readback confirmed 10,000 fixture-only rows and migration version 6.

## Observed results

The successful batch had three runs. Run 0 is excluded as warm-up with possible
build contention. The table uses runs 1 and 2, not cold-boot statistics.

| Metric | Run 1 | Run 2 |
|---|---:|---:|
| Launch to observed first 500 items ready | 879ms | 940ms |
| Rust run entry to readiness record | 850ms | 886ms |
| Search rcp median, 5 runs | 150ms | 150ms |
| Search 中文 median | 100ms | 101ms |
| Search 中文 rcp median | 151ms | 165ms |
| Search missingneedle median | 33ms | 33ms |
| Search 中文备注 median | 84ms | 84ms |
| Programmatic scroll frame gap median / p95 | 17 / 18ms | 17 / 18ms |
| Peak sampled main-process RSS | 148.4MiB | 145.9MiB |
| Rendered cards / loaded records at end | 10 / 500 | 10 / 500 |

Search timing includes direct store invocation, real IPC/query, state update and
waiting two animation frames. It excludes input debounce/IME. Search results can
return 500 rows, unlike the earlier SQL benchmark's limit of 50. Each scroll run
advances the horizontal list for 180 frames; frame gap is not input latency or a
proof that every frame was fully painted. Virtualization retains only 10 cards.

Startup includes an intentional 100ms readiness gate. The first failed attempt
fired show before frontend listeners were ready; it timed out and was excluded.
The corrected runner waits for the mounted search field and invokes onPanelShow.
This is an instrumented fixture-open baseline, not the unmodified launch pathway.
RSS includes ONLY the Rust main process, not WebKit services or whole-app memory.
No release-build speedup, cold-launch, preview, IME, focus, paste or visual QA claim.

## Reproduce

Create a clean disposable managed worktree; keep the normal app data separate.
Run from the source workspace:

```sh
python3 scripts/native-performance/prepare.py /absolute/disposable/worktree
```

Build INSIDE that worktree with `pnpm tauri build --debug --no-bundle`, then run:

```sh
python3 scripts/native-performance/measure.py /absolute/disposable/worktree
```

Preparation refuses the source directory or a dirty worktree. Measurement checks
identifier/config/worktree and binary freshness, limits each run to 90 seconds,
and terminates only its own subprocess. Scripts currently target macOS.
Do not distribute the fixture build. Measurement writes only fixture artifacts;
cleanup is intentionally not automated. Main workspace application source is not
patched by the harness; normal pending FTS work remains separate and uncommitted.

Summary: docs/native-performance-2026-09-23.json. Raw logs/results are retained at
/Users/zhuguidong/.codex/worktrees/native-performance/Recopy/native-results.json.

## Next

Repeat with release Rust and account for WebKit memory before drawing conclusions
about overall app memory. Add real image/preview fixtures and native focus/paste
acceptance separately. Search is still the clearest scaling candidate, but this
small controlled sample does not justify changing fuzzy recall or ranking.
