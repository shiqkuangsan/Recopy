# Release native image/preview measurement (FR-086)

## Fixture and boundaries

The isolated native fixture uses optimized Rust and production Vite assets.
It contains 10,000 synthetic 768-byte text records and three generated RGB PNGs:
1600×1000 (252985 bytes), 6000×4000 (4201666 bytes), and 400×12000 (694841 bytes).
PNG CRCs and decoded scanline lengths were verified before execution. DB readback
confirmed 10003 fixture-only rows, three stored thumbnails/originals and migration 6.

The same unique app identifier, disabled clipboard capture and blocked paste/copy,
settings, shortcut and external-link commands protect the normal user environment.
No clipboard or real history was used. No production app behavior changed here.

## Three complete native runs

Run 0 includes fixture insertion and thumbnail generation and is retained in JSON;
it is excluded below. Runs 1/2 use an existing fixture and warmed filesystem caches.

| Metric | Run 1 | Run 2 |
|---|---:|---:|
| Launch to observed list ready | 1237ms | 968ms |
| Search rcp median (5 repeats) | 79ms | 90ms |
| Search 中文 median | 50ms | 50ms |
| Search 中文 rcp median | 67ms | 83ms |
| Search missingneedle median | 33ms | 33ms |
| Search 中文备注 median | 34ms | 34ms |
| Three image thumbnails ready | 49ms | 42ms |
| Scroll frame gap median / p95 | 17 / 18ms | 17 / 21ms |
| Main-process peak sampled RSS | 132.4MiB | 125.5MiB |

Preview timing starts before show_preview_window and ends after the separate
preview WebView confirms image.complete, nonzero natural dimensions and two RAFs.
A matching source-path event prevents another image's load from satisfying the wait.
Each row lists this run's first open followed by its two later opens, in milliseconds.

| Image | Run 1 | Run 2 |
|---|---|---|
| 1600×1000 | 108 / 108 / 85 | 135 / 109 / 108 |
| 6000×4000 | 214 / 113 / 105 | 214 / 86 / 84 |
| 400×12000 | 107 / 80 / 85 | 295 / 85 / 85 |

All 27 preview observations reported the expected natural width/height. This proves
image load plus RAF completion, not human visual/layout acceptance. Different image
sources are cycled; consecutive reopening of the same source is not covered.

## Memory attribution and interpretation

No WebKit process was found in the fixture's confirmed parent-child chain. Other
system WebKit processes existed, but their ownership was not established and their
RSS was NOT added. Unknown WebKit memory is not zero; whole-app memory remains
unmeasured. Main PID RSS alone cannot diagnose WebKit leaks or image-cache size.

The startup number includes a 100ms test readiness gate. Search invokes the store
directly, bypasses debounce/IME, and includes two RAF waits and up to 500 results.
Scroll uses 180 programmatic frame steps, not input latency. This is not a controlled
A/B with the earlier debug fixture: image content and sampling overhead also differ.
The large-image first/later gap indicates caching effects within this sample;
no new caching policy or search-semantic change is justified from it alone.

## Reproduce and evidence

In a fresh disposable managed worktree, prepare with:
`python3 scripts/native-performance/prepare.py /absolute/worktree --images`.
Build inside it with `pnpm tauri build --no-bundle`, then run:
`python3 scripts/native-performance/measure.py /absolute/worktree --release`.

The scripts refuse Python -O, validate fixture identity and binary freshness, and
record the binary SHA256. Output is native-results-release.json in the worktree.
Summary is docs/native-release-performance-2026-09-23.json. Raw results remain at
/Users/zhuguidong/.codex/worktrees/native-release-performance/Recopy/native-results-release.json.
The final optimized build passed; independent isolation/evidence review accompanies
FR-086. Windows, actual user clipboard/paste, IME and full memory attribution remain
separate acceptance work. No commit, push or release was performed.
