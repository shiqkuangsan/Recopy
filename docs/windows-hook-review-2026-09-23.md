# Windows hook reliability review — 2026-09-23

## Changes

Global hook handles allowed a late old thread to unhook a newer installation.
Each installation now owns its resources, thread ID and modifier state.
A registry reserves one pending session for concurrent installers. Removal cancels
it atomically before a successor can start; native cleanup runs outside the lock.
Publication/cancellation transfer cleanup ownership exactly once. Ctrl+F stops
its own callback session, and late cleanup never touches a successor.
The hook thread creates its message queue before publishing its ID.

The mouse callback now reads a cached preview HWND instead of calling a synchronous
Tauri UI getter. Initialization/show populate it; window destruction clears it.

## Verification

- Integrated macOS Rust suite: 83 passed, including 6 lifecycle tests for concurrent
  installation, cancellation, publication races, ownership, modifiers and late exit.
- cargo clippy --all-targets -- -D warnings: passed on macOS.
- Independent read-only review found a registry removal/cancellation race in the
  first candidate. The final atomic cancellation and deterministic regression
  assertions passed independent static review.
- A temporary inclusion of the actual Windows module passed macOS Rust type checking
  before the final registry fix. This is not a Windows target build; the temporary
  module was removed. Integrated files match the reviewed isolated candidate.
- Windows target compilation and native interaction tests have NOT run.

## Remaining validation and limitations

Before release, validate rapid panel open/close, concurrent activation, Ctrl+F,
preview clicks, foreground restoration and input responsiveness on Windows.
Pure Rust tests do not exercise Win32 installation/unhooking or HWND lifetime.
PostThreadMessageW(WM_QUIT) failure is logged; a stopped live thread could remain
waiting in its message loop. Event emission still enters Tauri internals, so this
removes a specific UI getter wait rather than proving nonblocking callbacks.
No native input-latency improvement is claimed without measurement.
