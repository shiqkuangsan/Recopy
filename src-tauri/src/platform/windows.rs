use std::sync::{
    atomic::{AtomicBool, AtomicIsize, AtomicU32, Ordering},
    OnceLock,
};
use tauri::{Emitter, Manager};

// ---------------------------------------------------------------------------
// Win32 FFI declarations (raw, no external crate dependency)
// ---------------------------------------------------------------------------

#[allow(non_snake_case, non_upper_case_globals)]
mod win32 {
    // Types – match Win32 on x64
    pub type HWND = isize;
    pub type HHOOK = isize;
    pub type HINSTANCE = isize;
    pub type WPARAM = usize;
    pub type LPARAM = isize;
    pub type LRESULT = isize;

    // ShowWindow commands
    pub const SW_HIDE: i32 = 0;
    pub const SW_SHOWNOACTIVATE: i32 = 4;

    // SetWindowPos constants
    pub const HWND_TOPMOST: isize = -1;
    pub const SWP_NOMOVE: u32 = 0x0002;
    pub const SWP_NOSIZE: u32 = 0x0001;
    pub const SWP_NOACTIVATE: u32 = 0x0010;

    // Hook / messages
    pub const WH_KEYBOARD_LL: i32 = 13;
    pub const WH_MOUSE_LL: i32 = 14;
    pub const WM_KEYDOWN: u32 = 0x0100;
    pub const WM_KEYUP: u32 = 0x0101;
    pub const WM_LBUTTONDOWN: u32 = 0x0201;
    pub const WM_RBUTTONDOWN: u32 = 0x0204;
    pub const WM_SYSKEYDOWN: u32 = 0x0104;
    pub const WM_SYSKEYUP: u32 = 0x0105;
    pub const WM_QUIT: u32 = 0x0012;

    // Virtual-key codes
    pub const VK_BACK: u32 = 0x08;
    pub const VK_TAB: u32 = 0x09;
    pub const VK_RETURN: u32 = 0x0D;
    pub const VK_SHIFT: u32 = 0x10;
    pub const VK_CONTROL: u32 = 0x11;
    pub const VK_ESCAPE: u32 = 0x1B;
    pub const VK_SPACE: u32 = 0x20;
    pub const VK_LEFT: u32 = 0x25;
    pub const VK_UP: u32 = 0x26;
    pub const VK_RIGHT: u32 = 0x27;
    pub const VK_DOWN: u32 = 0x28;
    pub const VK_DELETE: u32 = 0x2E;
    pub const VK_LSHIFT: u32 = 0xA0;
    pub const VK_RSHIFT: u32 = 0xA1;
    pub const VK_LCONTROL: u32 = 0xA2;
    pub const VK_RCONTROL: u32 = 0xA3;
    pub const VK_C: u32 = 0x43;
    pub const VK_F: u32 = 0x46;
    pub const VK_V: u32 = 0x56;
    pub const VK_OEM_COMMA: u32 = 0xBC;

    // WM_NCHITTEST constants
    pub const WM_NCHITTEST: u32 = 0x0084;
    pub const HTCLIENT: isize = 1;
    pub const HTLEFT: isize = 10;
    pub const HTRIGHT: isize = 11;
    pub const HTTOP: isize = 12;
    pub const HTTOPLEFT: isize = 13;
    pub const HTTOPRIGHT: isize = 14;
    pub const HTBOTTOM: isize = 15;
    pub const HTBOTTOMLEFT: isize = 16;
    pub const HTBOTTOMRIGHT: isize = 17;
    pub const GWLP_WNDPROC: i32 = -4;

    // SendInput constants
    pub const INPUT_KEYBOARD: u32 = 1;
    pub const KEYEVENTF_KEYUP: u32 = 0x0002;

    // Monitor detection types
    #[repr(C)]
    #[derive(Copy, Clone)]
    pub struct POINT {
        pub x: i32,
        pub y: i32,
    }

    #[repr(C)]
    pub struct RECT {
        pub left: i32,
        pub top: i32,
        pub right: i32,
        pub bottom: i32,
    }

    pub const MONITOR_DEFAULTTONEAREST: u32 = 2;

    #[repr(C)]
    pub struct MONITORINFO {
        pub cb_size: u32,
        pub rc_monitor: RECT,
        pub rc_work: RECT,
        pub dw_flags: u32,
    }

    /// KBDLLHOOKSTRUCT – passed via LPARAM in WH_KEYBOARD_LL callback.
    #[repr(C)]
    pub struct KBDLLHOOKSTRUCT {
        pub vk_code: u32,
        pub scan_code: u32,
        pub flags: u32,
        pub time: u32,
        pub dw_extra_info: usize,
    }

    /// Flat representation of INPUT with KEYBDINPUT union variant.
    /// Layout matches `sizeof(INPUT) == 40` on x64 Windows.
    #[repr(C)]
    pub struct KeyboardInputRaw {
        pub input_type: u32,      // offset 0
        pub _pad0: u32,           // offset 4  (alignment for union)
        pub wvk: u16,             // offset 8
        pub wscan: u16,           // offset 10
        pub dw_flags: u32,        // offset 12
        pub time: u32,            // offset 16
        pub _pad1: u32,           // offset 20 (alignment for usize)
        pub dw_extra_info: usize, // offset 24
        pub _pad2: [u8; 8],       // offset 32 (pad to MOUSEINPUT union size)
    }

    impl KeyboardInputRaw {
        pub fn new(vk: u16, flags: u32) -> Self {
            Self {
                input_type: INPUT_KEYBOARD,
                _pad0: 0,
                wvk: vk,
                wscan: 0,
                dw_flags: flags,
                time: 0,
                _pad1: 0,
                dw_extra_info: 0,
                _pad2: [0; 8],
            }
        }
    }

    /// MSG structure for GetMessage loop.
    #[repr(C)]
    pub struct MSG {
        pub hwnd: HWND,
        pub message: u32,
        pub wparam: WPARAM,
        pub lparam: LPARAM,
        pub time: u32,
        pub pt_x: i32,
        pub pt_y: i32,
    }

    /// MSLLHOOKSTRUCT — passed via LPARAM in WH_MOUSE_LL callback.
    #[repr(C)]
    pub struct MSLLHOOKSTRUCT {
        pub pt_x: i32,
        pub pt_y: i32,
        pub mouse_data: u32,
        pub flags: u32,
        pub time: u32,
        pub dw_extra_info: usize,
    }

    #[repr(C)]
    pub struct RECT {
        pub left: i32,
        pub top: i32,
        pub right: i32,
        pub bottom: i32,
    }

    unsafe extern "system" {
        pub fn ShowWindow(hwnd: HWND, n_cmd_show: i32) -> i32;
        pub fn SetWindowPos(
            hwnd: HWND,
            hwnd_after: HWND,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> i32;
        pub fn IsWindowVisible(hwnd: HWND) -> i32;
        pub fn GetWindowRect(hwnd: HWND, rect: *mut RECT) -> i32;
        pub fn GetForegroundWindow() -> HWND;
        pub fn SetForegroundWindow(hwnd: HWND) -> i32;
        pub fn SetWindowsHookExW(
            id_hook: i32,
            lpfn: Option<unsafe extern "system" fn(i32, WPARAM, LPARAM) -> LRESULT>,
            hmod: HINSTANCE,
            thread_id: u32,
        ) -> HHOOK;
        pub fn UnhookWindowsHookEx(hhk: HHOOK) -> i32;
        pub fn CallNextHookEx(hhk: HHOOK, code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT;
        pub fn SendInput(c_inputs: u32, p_inputs: *const KeyboardInputRaw, cb_size: i32) -> u32;
        pub fn GetModuleHandleW(name: *const u16) -> HINSTANCE;
        pub fn GetCurrentProcessId() -> u32;
        pub fn GetCurrentThreadId() -> u32;
        pub fn GetWindowThreadProcessId(hwnd: HWND, pid: *mut u32) -> u32;
        pub fn GetMessageW(msg: *mut MSG, hwnd: HWND, filter_min: u32, filter_max: u32) -> i32;
        pub fn PostThreadMessageW(thread_id: u32, msg: u32, wparam: WPARAM, lparam: LPARAM) -> i32;
        pub fn SetWindowLongPtrW(hwnd: HWND, index: i32, new_long: isize) -> isize;
        pub fn CallWindowProcW(
            prev: isize,
            hwnd: HWND,
            msg: u32,
            wparam: WPARAM,
            lparam: LPARAM,
        ) -> LRESULT;
        pub fn GetCursorPos(point: *mut POINT) -> i32;
        pub fn MonitorFromPoint(pt: POINT, flags: u32) -> isize;
        pub fn GetMonitorInfoW(hmonitor: isize, lpmi: *mut MONITORINFO) -> i32;
        pub fn LoadLibraryW(name: *const u16) -> isize;
        pub fn GetProcAddress(hmodule: isize, name: *const u8) -> usize;
        pub fn FreeLibrary(hmodule: isize) -> i32;
    }
}

// ---------------------------------------------------------------------------
// Module-level statics
// ---------------------------------------------------------------------------

/// App handle for the keyboard hook callback to emit Tauri events.
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

/// Handle of the installed WH_KEYBOARD_LL hook (0 = no hook).
static HOOK_HANDLE: AtomicIsize = AtomicIsize::new(0);

/// Handle of the installed WH_MOUSE_LL hook (0 = no hook).
static MOUSE_HOOK_HANDLE: AtomicIsize = AtomicIsize::new(0);

/// HWND of the previous foreground window (saved before showing Recopy).
static PREV_FOREGROUND: AtomicIsize = AtomicIsize::new(0);

/// Original WndProc for the main window (before NCHITTEST subclass).
static ORIG_WNDPROC: AtomicIsize = AtomicIsize::new(0);

/// Panel position for NCHITTEST filtering: 0=none, 1=bottom, 2=top.
static PANEL_RESIZE_MODE: AtomicU32 = AtomicU32::new(0);

/// HWND of Recopy's main window (cached for the hook callback).
static MAIN_HWND: AtomicIsize = AtomicIsize::new(0);

/// Thread ID of the dedicated hook message-pump thread (0 = no thread).
static HOOK_THREAD_ID: AtomicU32 = AtomicU32::new(0);

/// Manually tracked modifier key state (updated by hook callback).
/// Required because GetAsyncKeyState is unreliable inside hook callbacks.
static CTRL_DOWN: AtomicBool = AtomicBool::new(false);
static SHIFT_DOWN: AtomicBool = AtomicBool::new(false);

/// Preview focus guard: skip main's blur while preview is opening.
static PREVIEW_FOCUS_GUARD: AtomicBool = AtomicBool::new(false);

/// Set before programmatically hiding preview, prevents blur → close-all.
static PREVIEW_PROGRAMMATIC_HIDE: AtomicBool = AtomicBool::new(false);

// ---------------------------------------------------------------------------
// HWND helper
// ---------------------------------------------------------------------------

fn get_hwnd(window: &tauri::WebviewWindow) -> Option<isize> {
    #[cfg(target_os = "windows")]
    {
        window.hwnd().ok().map(|h| h.0 as isize)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
        None
    }
}

fn is_hook_active() -> bool {
    HOOK_HANDLE.load(Ordering::SeqCst) != 0
}

/// Check if the current foreground window belongs to the Recopy process.
#[allow(dead_code)]
pub fn is_recopy_foreground() -> bool {
    unsafe {
        let fg = win32::GetForegroundWindow();
        if fg == 0 {
            return false;
        }
        let mut fg_pid: u32 = 0;
        win32::GetWindowThreadProcessId(fg, &mut fg_pid);
        fg_pid == win32::GetCurrentProcessId()
    }
}

// ---------------------------------------------------------------------------
// Platform API (same interface as macos.rs / fallback.rs)
// ---------------------------------------------------------------------------

pub fn init_platform(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    APP_HANDLE.set(app.handle().clone()).ok();
    if let Some(window) = app.get_webview_window("main") {
        if let Some(hwnd) = get_hwnd(&window) {
            MAIN_HWND.store(hwnd, Ordering::SeqCst);
        }
    }
    Ok(())
}

/// Show the main window **without activating** (previous app keeps focus).
/// Installs a global keyboard hook so arrow/Enter/Space/Escape still work.
pub fn platform_show_window(app: &tauri::AppHandle, _panel_position: &str) {
    if let Some(window) = app.get_webview_window("main") {
        if let Some(hwnd) = get_hwnd(&window) {
            MAIN_HWND.store(hwnd, Ordering::SeqCst);
            unsafe {
                // Remember who currently owns the foreground
                let prev = win32::GetForegroundWindow();
                PREV_FOREGROUND.store(prev, Ordering::SeqCst);

                // Show without stealing focus
                win32::ShowWindow(hwnd, win32::SW_SHOWNOACTIVATE);
                win32::SetWindowPos(
                    hwnd,
                    win32::HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    win32::SWP_NOMOVE | win32::SWP_NOSIZE | win32::SWP_NOACTIVATE,
                );
            }
            install_keyboard_hook();
        }
    }
}

pub fn platform_hide_window(app: &tauri::AppHandle) {
    remove_keyboard_hook();
    // Only restore the previous foreground if the main panel itself is the
    // current foreground. If another Recopy window (settings) has focus, don't
    // override it — otherwise restore_foreground pushes settings behind other apps.
    // In floating mode (non-activating), main is never foreground → no restore needed.
    let main_hwnd = MAIN_HWND.load(Ordering::SeqCst);
    let fg = unsafe { win32::GetForegroundWindow() };
    let should_restore = main_hwnd != 0 && fg == main_hwnd;
    if let Some(window) = app.get_webview_window("main") {
        if let Some(hwnd) = get_hwnd(&window) {
            unsafe {
                win32::ShowWindow(hwnd, win32::SW_HIDE);
            }
        }
        // Also tell Tauri so its internal state stays consistent
        let _ = window.hide();
    }
    if should_restore {
        restore_foreground();
    }
}

pub fn platform_is_visible(app: &tauri::AppHandle) -> bool {
    if let Some(window) = app.get_webview_window("main") {
        if let Some(hwnd) = get_hwnd(&window) {
            return unsafe { win32::IsWindowVisible(hwnd) != 0 };
        }
    }
    false
}

/// Before paste: ensure the previous app is the foreground window so that
/// SendInput Ctrl+V reaches it.
/// - Floating mode (hook active): just remove the hook — previous app is
///   already foreground since we never stole focus.
/// - Activated mode (user clicked / Ctrl+F): Recopy owns the foreground,
///   so we must hide and restore the previous app first.
pub fn platform_resign_before_paste(app: &tauri::AppHandle) {
    if is_hook_active() {
        // Floating mode: previous app is still foreground, just drop the hook.
        remove_keyboard_hook();
    } else {
        // Activated mode: Recopy is foreground → hide + restore previous app.
        remove_keyboard_hook();
        if let Some(window) = app.get_webview_window("main") {
            if let Some(hwnd) = get_hwnd(&window) {
                unsafe {
                    win32::ShowWindow(hwnd, win32::SW_HIDE);
                }
            }
            let _ = window.hide();
        }
        restore_foreground();
    }
}

/// Called from the `Focused(true)` handler when the user clicks on Recopy.
/// The webview now owns keyboard focus, so the hook is no longer needed.
pub fn on_window_focused() {
    remove_keyboard_hook();
}

// ---------------------------------------------------------------------------
// NCHITTEST subclass — restrict resize to vertical edges only (top/bottom mode)
// ---------------------------------------------------------------------------

/// Install a WndProc subclass that filters WM_NCHITTEST results so only
/// vertical resize edges work (no left/right/corner resize cursors).
pub fn install_nchittest_hook(hwnd: isize, panel_position: &str) {
    let mode = match panel_position {
        "bottom" => 1u32,
        "top" => 2u32,
        _ => {
            PANEL_RESIZE_MODE.store(0, Ordering::SeqCst);
            return;
        }
    };
    PANEL_RESIZE_MODE.store(mode, Ordering::SeqCst);
    // Only subclass once — avoid storing our own WndProc as the original
    if ORIG_WNDPROC.load(Ordering::SeqCst) != 0 {
        return;
    }
    unsafe {
        let prev = win32::SetWindowLongPtrW(hwnd, win32::GWLP_WNDPROC, nchittest_wndproc as isize);
        if prev != 0 {
            ORIG_WNDPROC.store(prev, Ordering::SeqCst);
        }
    }
}

unsafe extern "system" fn nchittest_wndproc(
    hwnd: win32::HWND,
    msg: u32,
    wparam: win32::WPARAM,
    lparam: win32::LPARAM,
) -> win32::LRESULT {
    let orig = ORIG_WNDPROC.load(Ordering::SeqCst);
    let result = win32::CallWindowProcW(orig, hwnd, msg, wparam, lparam);

    if msg == win32::WM_NCHITTEST {
        let mode = PANEL_RESIZE_MODE.load(Ordering::SeqCst);
        // bottom mode (1): only HTTOP allowed (drag top edge up to grow)
        // top mode (2): only HTBOTTOM allowed (drag bottom edge down to grow)
        let allowed = if mode == 1 {
            win32::HTTOP
        } else {
            win32::HTBOTTOM
        };
        match result {
            win32::HTLEFT
            | win32::HTRIGHT
            | win32::HTTOPLEFT
            | win32::HTTOPRIGHT
            | win32::HTBOTTOMLEFT
            | win32::HTBOTTOMRIGHT => return win32::HTCLIENT,
            r if (r == win32::HTTOP || r == win32::HTBOTTOM) && r != allowed => {
                return win32::HTCLIENT
            }
            _ => {}
        }
    }

    result
}

// ---------------------------------------------------------------------------
// Keyboard hook
// ---------------------------------------------------------------------------

/// Spawn a dedicated thread with a Win32 message pump and install hooks there.
/// Both WH_KEYBOARD_LL and WH_MOUSE_LL require a message loop on the installing
/// thread — tokio worker threads don't have one, so we use a dedicated std::thread.
/// Blocks until hooks are confirmed installed (or fail).
fn install_keyboard_hook() {
    if is_hook_active() {
        return;
    }
    let (tx, rx) = std::sync::mpsc::sync_channel::<bool>(1);
    std::thread::spawn(move || unsafe {
        let thread_id = win32::GetCurrentThreadId();
        let hmod = win32::GetModuleHandleW(std::ptr::null());
        let kb_hook =
            win32::SetWindowsHookExW(win32::WH_KEYBOARD_LL, Some(keyboard_hook_proc), hmod, 0);
        if kb_hook == 0 {
            let _ = tx.send(false);
            return;
        }
        HOOK_HANDLE.store(kb_hook, Ordering::SeqCst);

        // Mouse hook for click-outside-to-close (non-activating window never gets blur)
        let mouse_hook =
            win32::SetWindowsHookExW(win32::WH_MOUSE_LL, Some(mouse_hook_proc), hmod, 0);
        if mouse_hook != 0 {
            MOUSE_HOOK_HANDLE.store(mouse_hook, Ordering::SeqCst);
        }

        HOOK_THREAD_ID.store(thread_id, Ordering::SeqCst);
        let _ = tx.send(true);

        // Message pump — keeps the hooks alive.
        // GetMessage returns 0 on WM_QUIT, ending the loop.
        let mut msg: win32::MSG = std::mem::zeroed();
        while win32::GetMessageW(&mut msg, 0, 0, 0) > 0 {}

        // Cleanup (in case remove_keyboard_hook didn't already clear these)
        let h = HOOK_HANDLE.swap(0, Ordering::SeqCst);
        if h != 0 {
            win32::UnhookWindowsHookEx(h);
        }
        let mh = MOUSE_HOOK_HANDLE.swap(0, Ordering::SeqCst);
        if mh != 0 {
            win32::UnhookWindowsHookEx(mh);
        }
        HOOK_THREAD_ID.store(0, Ordering::SeqCst);
        CTRL_DOWN.store(false, Ordering::SeqCst);
        SHIFT_DOWN.store(false, Ordering::SeqCst);
    });
    // Wait for hook installation before returning — ensures is_hook_active()
    // is accurate immediately after this call.
    match rx.recv() {
        Ok(true) => {}
        Ok(false) => log::warn!("Failed to install keyboard hook"),
        Err(_) => log::warn!("Hook thread terminated unexpectedly"),
    }
}

/// Unhook immediately (synchronous) and signal the message-pump thread to exit.
fn remove_keyboard_hook() {
    let handle = HOOK_HANDLE.swap(0, Ordering::SeqCst);
    if handle != 0 {
        unsafe {
            win32::UnhookWindowsHookEx(handle);
        }
    }
    let mh = MOUSE_HOOK_HANDLE.swap(0, Ordering::SeqCst);
    if mh != 0 {
        unsafe {
            win32::UnhookWindowsHookEx(mh);
        }
    }
    let tid = HOOK_THREAD_ID.swap(0, Ordering::SeqCst);
    if tid != 0 {
        unsafe {
            win32::PostThreadMessageW(tid, win32::WM_QUIT, 0, 0);
        }
    }
    CTRL_DOWN.store(false, Ordering::SeqCst);
    SHIFT_DOWN.store(false, Ordering::SeqCst);
}

/// Low-level keyboard hook procedure.
/// Intercepts navigation keys and forwards them as `platform-keydown` Tauri
/// events so the frontend can drive the same logic as native keydown.
///
/// Modifier state is tracked manually via CTRL_DOWN / SHIFT_DOWN atomics
/// because GetAsyncKeyState is unreliable inside hook callbacks (MSDN:
/// "the hook is called before the async key state is updated").
unsafe extern "system" fn keyboard_hook_proc(
    code: i32,
    wparam: win32::WPARAM,
    lparam: win32::LPARAM,
) -> win32::LRESULT {
    if code < 0 {
        return win32::CallNextHookEx(0, code, wparam, lparam);
    }

    let msg = wparam as u32;
    let is_down = msg == win32::WM_KEYDOWN || msg == win32::WM_SYSKEYDOWN;
    let is_up = msg == win32::WM_KEYUP || msg == win32::WM_SYSKEYUP;

    if !is_down && !is_up {
        return win32::CallNextHookEx(0, code, wparam, lparam);
    }

    let kbd = &*(lparam as *const win32::KBDLLHOOKSTRUCT);
    let vk = kbd.vk_code;

    // --- Track modifier state (handles both left/right and generic VK codes) ---
    match vk {
        win32::VK_CONTROL | win32::VK_LCONTROL | win32::VK_RCONTROL => {
            CTRL_DOWN.store(is_down, Ordering::SeqCst);
            return win32::CallNextHookEx(0, code, wparam, lparam);
        }
        win32::VK_SHIFT | win32::VK_LSHIFT | win32::VK_RSHIFT => {
            SHIFT_DOWN.store(is_down, Ordering::SeqCst);
            return win32::CallNextHookEx(0, code, wparam, lparam);
        }
        _ => {}
    }

    // Only intercept key-down events for navigation
    if !is_down {
        return win32::CallNextHookEx(0, code, wparam, lparam);
    }

    // Safety-check: only intercept when the foreground window does NOT
    // belong to Recopy (e.g. settings window open → let keys through).
    let fg = win32::GetForegroundWindow();
    let mut fg_pid: u32 = 0;
    win32::GetWindowThreadProcessId(fg, &mut fg_pid);
    if fg_pid == win32::GetCurrentProcessId() {
        return win32::CallNextHookEx(0, code, wparam, lparam);
    }

    let ctrl = CTRL_DOWN.load(Ordering::SeqCst);
    let shift = SHIFT_DOWN.load(Ordering::SeqCst);

    // Map VK to DOM key name (matching KeyboardEvent.key)
    let key: Option<&str> = match vk {
        win32::VK_UP => Some("ArrowUp"),
        win32::VK_DOWN => Some("ArrowDown"),
        win32::VK_LEFT => Some("ArrowLeft"),
        win32::VK_RIGHT => Some("ArrowRight"),
        win32::VK_RETURN => Some("Enter"),
        win32::VK_SPACE => Some(" "),
        win32::VK_ESCAPE => Some("Escape"),
        win32::VK_TAB => Some("Tab"),
        win32::VK_DELETE => Some("Delete"),
        win32::VK_BACK => Some("Backspace"),
        win32::VK_C if ctrl => Some("c"),
        win32::VK_OEM_COMMA if ctrl => Some(","),
        win32::VK_F if ctrl => {
            // Ctrl+F → activate the window so the SearchBar can receive
            // real keyboard input, then forward the event.
            // Unhook both keyboard and mouse hooks + post WM_QUIT to exit message pump.
            let h = HOOK_HANDLE.swap(0, Ordering::SeqCst);
            if h != 0 {
                win32::UnhookWindowsHookEx(h);
            }
            let mh = MOUSE_HOOK_HANDLE.swap(0, Ordering::SeqCst);
            if mh != 0 {
                win32::UnhookWindowsHookEx(mh);
            }
            let tid = HOOK_THREAD_ID.swap(0, Ordering::SeqCst);
            if tid != 0 {
                win32::PostThreadMessageW(tid, win32::WM_QUIT, 0, 0);
            }
            CTRL_DOWN.store(false, Ordering::SeqCst);
            SHIFT_DOWN.store(false, Ordering::SeqCst);

            let main = MAIN_HWND.load(Ordering::SeqCst);
            if main != 0 {
                win32::SetForegroundWindow(main);
            }
            if let Some(app) = APP_HANDLE.get() {
                let _ = app.emit(
                    "platform-keydown",
                    serde_json::json!({"key":"f","ctrlKey":true,"shiftKey":false}),
                );
            }
            return 1; // consumed
        }
        _ => None,
    };

    if let Some(key_name) = key {
        if let Some(app) = APP_HANDLE.get() {
            let _ = app.emit(
                "platform-keydown",
                serde_json::json!({
                    "key": key_name,
                    "ctrlKey": ctrl,
                    "shiftKey": shift,
                }),
            );
        }
        return 1; // consumed – don't forward to previous app
    }

    win32::CallNextHookEx(0, code, wparam, lparam)
}

// ---------------------------------------------------------------------------
// Mouse hook — click-outside-to-close for non-activating window
// ---------------------------------------------------------------------------

/// Low-level mouse hook. Detects clicks outside all Recopy windows and emits
/// `platform-click-outside` so the main panel can be hidden (analogous to
/// NSPanel's resignsKey on macOS).
unsafe extern "system" fn mouse_hook_proc(
    code: i32,
    wparam: win32::WPARAM,
    lparam: win32::LPARAM,
) -> win32::LRESULT {
    if code >= 0 {
        let msg = wparam as u32;
        if msg == win32::WM_LBUTTONDOWN || msg == win32::WM_RBUTTONDOWN {
            let ms = &*(lparam as *const win32::MSLLHOOKSTRUCT);
            let x = ms.pt_x;
            let y = ms.pt_y;

            let main = MAIN_HWND.load(Ordering::SeqCst);
            if main != 0 && win32::IsWindowVisible(main) != 0 && !point_in_window(x, y, main) {
                // Also check preview window
                let mut on_recopy_window = false;
                if let Some(app) = APP_HANDLE.get() {
                    if let Some(preview) = app.get_webview_window("preview") {
                        if let Some(phwnd) = get_hwnd(&preview) {
                            if win32::IsWindowVisible(phwnd) != 0 && point_in_window(x, y, phwnd) {
                                on_recopy_window = true;
                            }
                        }
                    }
                }

                if !on_recopy_window {
                    if let Some(app) = APP_HANDLE.get() {
                        let _ = app.emit("platform-click-outside", ());
                    }
                }
            }
        }
    }
    win32::CallNextHookEx(0, code, wparam, lparam)
}

fn point_in_window(x: i32, y: i32, hwnd: isize) -> bool {
    unsafe {
        let mut rect: win32::RECT = std::mem::zeroed();
        if win32::GetWindowRect(hwnd, &mut rect) != 0 {
            x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom
        } else {
            false
        }
    }
}

// ---------------------------------------------------------------------------
// Cursor-based monitor detection (multi-monitor support)
// ---------------------------------------------------------------------------

/// Detect which monitor contains the mouse cursor and return its bounds.
/// Returns (x, y, width, height) in logical coordinates.
/// Note: on mixed-DPI multi-monitor setups, positioning may be slightly
/// inaccurate because Tauri converts logical→physical using the window's
/// current monitor DPI, not the target monitor's.
pub fn platform_cursor_monitor() -> Option<(f64, f64, f64, f64)> {
    unsafe {
        let mut pt = win32::POINT { x: 0, y: 0 };
        if win32::GetCursorPos(&mut pt) == 0 {
            return None;
        }

        let hmonitor = win32::MonitorFromPoint(pt, win32::MONITOR_DEFAULTTONEAREST);
        if hmonitor == 0 {
            return None;
        }

        let mut info: win32::MONITORINFO = std::mem::zeroed();
        info.cb_size = std::mem::size_of::<win32::MONITORINFO>() as u32;
        if win32::GetMonitorInfoW(hmonitor, &mut info) == 0 {
            return None;
        }

        let rc = &info.rc_monitor;
        let phys_x = rc.left as f64;
        let phys_y = rc.top as f64;
        let phys_w = (rc.right - rc.left) as f64;
        let phys_h = (rc.bottom - rc.top) as f64;

        let scale = get_monitor_dpi_scale(hmonitor);
        Some((
            phys_x / scale,
            phys_y / scale,
            phys_w / scale,
            phys_h / scale,
        ))
    }
}

pub fn platform_menu_bar_height() -> f64 {
    0.0 // Windows has no macOS-style menu bar
}

/// Get the DPI scale factor for a monitor (1.0 = 96 DPI = 100%).
/// Dynamically loads GetDpiForMonitor from Shcore.dll for compatibility.
fn get_monitor_dpi_scale(hmonitor: isize) -> f64 {
    type GetDpiForMonitorFn = unsafe extern "system" fn(isize, u32, *mut u32, *mut u32) -> i32;

    unsafe {
        // "Shcore.dll" as null-terminated wide string
        let lib_name: [u16; 11] = [
            b'S' as u16,
            b'h' as u16,
            b'c' as u16,
            b'o' as u16,
            b'r' as u16,
            b'e' as u16,
            b'.' as u16,
            b'd' as u16,
            b'l' as u16,
            b'l' as u16,
            0,
        ];
        let hmodule = win32::LoadLibraryW(lib_name.as_ptr());
        if hmodule == 0 {
            return 1.0;
        }

        let proc_name = b"GetDpiForMonitor\0";
        let proc = win32::GetProcAddress(hmodule, proc_name.as_ptr());
        if proc == 0 {
            win32::FreeLibrary(hmodule);
            return 1.0;
        }

        let get_dpi: GetDpiForMonitorFn = std::mem::transmute(proc);
        let mut dpi_x: u32 = 96;
        let mut dpi_y: u32 = 96;
        // MDT_EFFECTIVE_DPI = 0
        let hr = get_dpi(hmonitor, 0, &mut dpi_x, &mut dpi_y);
        win32::FreeLibrary(hmodule);

        if hr == 0 {
            dpi_x as f64 / 96.0
        } else {
            1.0
        }
    }
}

// ---------------------------------------------------------------------------
// Simulate paste (Ctrl+V) via SendInput
// ---------------------------------------------------------------------------

pub fn simulate_paste_keys() {
    // Wait for foreground window to settle after SetForegroundWindow handoff.
    // In activated mode, Recopy was foreground — poll until it's no longer foreground
    // so SendInput reaches the correct target. Max wait: 10ms (5 × 2ms).
    let main = MAIN_HWND.load(Ordering::SeqCst);
    if main != 0 {
        for _ in 0..5 {
            if unsafe { win32::GetForegroundWindow() } != main {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(2));
        }
    }

    let inputs = [
        win32::KeyboardInputRaw::new(0x11, 0), // Ctrl down
        win32::KeyboardInputRaw::new(win32::VK_V as u16, 0), // V down
        win32::KeyboardInputRaw::new(win32::VK_V as u16, win32::KEYEVENTF_KEYUP), // V up
        win32::KeyboardInputRaw::new(0x11, win32::KEYEVENTF_KEYUP), // Ctrl up
    ];
    unsafe {
        win32::SendInput(
            4,
            inputs.as_ptr(),
            std::mem::size_of::<win32::KeyboardInputRaw>() as i32,
        );
    }
}

// ---------------------------------------------------------------------------
// Foreground restore
// ---------------------------------------------------------------------------

fn restore_foreground() {
    let prev = PREV_FOREGROUND.swap(0, Ordering::SeqCst);
    if prev != 0 {
        unsafe {
            win32::SetForegroundWindow(prev);
        }
    }
}

// ---------------------------------------------------------------------------
// Preview window (non-activating in floating mode, focus-dance in active mode)
// ---------------------------------------------------------------------------

pub fn init_preview_panel(_app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

pub fn platform_show_preview(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("preview") {
        if is_hook_active() {
            // Floating mode: show preview without activating (no focus change)
            if let Some(hwnd) = get_hwnd(&window) {
                unsafe {
                    win32::ShowWindow(hwnd, win32::SW_SHOWNOACTIVATE);
                    win32::SetWindowPos(
                        hwnd,
                        win32::HWND_TOPMOST,
                        0,
                        0,
                        0,
                        0,
                        win32::SWP_NOMOVE | win32::SWP_NOSIZE | win32::SWP_NOACTIVATE,
                    );
                }
            }
        } else {
            // Activated mode: standard focus-dance (show preview → return focus to main)
            PREVIEW_FOCUS_GUARD.store(true, Ordering::SeqCst);
            let _ = window.show();
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.set_focus();
            }
        }
    }
}

pub fn platform_hide_preview(app: &tauri::AppHandle) {
    PREVIEW_FOCUS_GUARD.store(false, Ordering::SeqCst);
    if let Some(window) = app.get_webview_window("preview") {
        PREVIEW_PROGRAMMATIC_HIDE.store(true, Ordering::SeqCst);
        // Always use Win32 hide — preview may have been shown via
        // SW_SHOWNOACTIVATE (floating mode), so Tauri alone won't hide it.
        if let Some(hwnd) = get_hwnd(&window) {
            unsafe {
                win32::ShowWindow(hwnd, win32::SW_HIDE);
            }
        }
        let _ = window.hide();
    }
}

pub fn is_preview_focus_guard() -> bool {
    PREVIEW_FOCUS_GUARD.load(Ordering::SeqCst)
}

pub fn set_preview_focus_guard(val: bool) {
    PREVIEW_FOCUS_GUARD.store(val, Ordering::SeqCst);
}

pub fn take_preview_programmatic_hide() -> bool {
    PREVIEW_PROGRAMMATIC_HIDE.swap(false, Ordering::SeqCst)
}

// ---------------------------------------------------------------------------
// HUD window
// ---------------------------------------------------------------------------

pub fn init_hud_panel(_app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

pub fn platform_show_hud(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("hud") {
        let _ = window.show();
    }
}

pub fn platform_hide_hud(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("hud") {
        let _ = window.hide();
    }
}
