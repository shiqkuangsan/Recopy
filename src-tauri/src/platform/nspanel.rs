//! Internal NSPanel module — replaces tauri-nspanel to avoid forced macos-private-api dependency.
//!
//! Provides isa-swizzling to convert Tauri's NSWindow into NSPanel subclasses
//! with custom behavior (floating, non-activating, key window control).

use std::cell::Cell;
use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::{Arc, Mutex};

use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, NSObjectProtocol, ProtocolObject};
use objc2::{define_class, msg_send, ClassType, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSPanel, NSResponder, NSWindow, NSWindowDelegate};
use objc2_foundation::{NSNotification, NSObject};
use tauri::Manager;

// ─────────────────────────────────────────────────────────────────────────────
// ObjC runtime: isa-swizzling
// ─────────────────────────────────────────────────────────────────────────────

extern "C" {
    fn object_setClass(obj: *mut AnyObject, cls: *const AnyClass) -> *const AnyClass;
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom NSPanel subclasses (isa-swizzle targets)
// ─────────────────────────────────────────────────────────────────────────────

// RecopyPanel: floating, CAN become key (for keyboard input), cannot become main.
// Used for main window and HUD.
define_class!(
    #[unsafe(super(NSPanel, NSWindow, NSResponder, NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "RawRecopyPanel"]
    pub(crate) struct RawRecopyPanel;

    impl RawRecopyPanel {
        #[unsafe(method(canBecomeKeyWindow))]
        fn can_become_key_window(&self) -> bool {
            true
        }

        #[unsafe(method(canBecomeMainWindow))]
        fn can_become_main_window(&self) -> bool {
            false
        }

        #[unsafe(method(isFloatingPanel))]
        fn is_floating_panel(&self) -> bool {
            true
        }
    }
);

// PreviewPanel: floating, CANNOT become key (no focus steal), cannot become main.
// Used for Quick Look preview overlay.
define_class!(
    #[unsafe(super(NSPanel, NSWindow, NSResponder, NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "RawPreviewPanel"]
    pub(crate) struct RawPreviewPanel;

    impl RawPreviewPanel {
        #[unsafe(method(canBecomeKeyWindow))]
        fn can_become_key_window(&self) -> bool {
            false
        }

        #[unsafe(method(canBecomeMainWindow))]
        fn can_become_main_window(&self) -> bool {
            false
        }

        #[unsafe(method(isFloatingPanel))]
        fn is_floating_panel(&self) -> bool {
            true
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// NSWindowDelegate for focus events
// ─────────────────────────────────────────────────────────────────────────────

struct PanelDelegateIvars {
    on_become_key: Cell<Option<Box<dyn Fn()>>>,
    on_resign_key: Cell<Option<Box<dyn Fn()>>>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "RecopyPanelDelegate"]
    #[ivars = PanelDelegateIvars]
    struct RawPanelDelegate;

    unsafe impl NSObjectProtocol for RawPanelDelegate {}

    unsafe impl NSWindowDelegate for RawPanelDelegate {
        #[unsafe(method(windowDidBecomeKey:))]
        unsafe fn window_did_become_key(&self, _notification: &NSNotification) {
            let cb = self.ivars().on_become_key.take();
            if let Some(ref callback) = cb {
                callback();
            }
            self.ivars().on_become_key.set(cb);
        }

        #[unsafe(method(windowDidResignKey:))]
        unsafe fn window_did_resign_key(&self, _notification: &NSNotification) {
            let cb = self.ivars().on_resign_key.take();
            if let Some(ref callback) = cb {
                callback();
            }
            self.ivars().on_resign_key.set(cb);
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// EventHandler — safe wrapper around the ObjC delegate
// ─────────────────────────────────────────────────────────────────────────────

pub struct EventHandler {
    inner: Retained<RawPanelDelegate>,
}

impl EventHandler {
    pub fn new() -> Self {
        let mtm = MainThreadMarker::new().expect("EventHandler must be created on main thread");
        let inner = RawPanelDelegate::alloc(mtm).set_ivars(PanelDelegateIvars {
            on_become_key: Cell::new(None),
            on_resign_key: Cell::new(None),
        });
        let inner: Retained<RawPanelDelegate> = unsafe { msg_send![super(inner), init] };
        Self { inner }
    }

    pub fn set_on_become_key<F: Fn() + 'static>(&self, callback: F) {
        self.inner
            .ivars()
            .on_become_key
            .set(Some(Box::new(callback)));
    }

    pub fn set_on_resign_key<F: Fn() + 'static>(&self, callback: F) {
        self.inner
            .ivars()
            .on_resign_key
            .set(Some(Box::new(callback)));
    }

    fn as_delegate(&self) -> &ProtocolObject<dyn NSWindowDelegate> {
        ProtocolObject::from_ref(&*self.inner)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PanelHandle — wraps a retained NSPanel with convenience methods
// ─────────────────────────────────────────────────────────────────────────────

pub struct PanelHandle {
    ns_panel: Retained<NSPanel>,
    label: String,
    // Prevent the delegate from being deallocated (NSWindow delegate is a weak ref)
    _event_handler: Option<EventHandler>,
}

// SAFETY: NSPanel operations must happen on the main thread. We implement
// Send + Sync only for Tauri's state management — actual calls are dispatched
// via run_on_main_thread in the platform layer.
unsafe impl Send for PanelHandle {}
unsafe impl Sync for PanelHandle {}

impl PanelHandle {
    /// Show the panel without making it key.
    pub fn show(&self) {
        self.ns_panel.orderFrontRegardless();
    }

    /// Hide the panel.
    pub fn hide(&self) {
        unsafe {
            let _: () = msg_send![&*self.ns_panel, orderOut: std::ptr::null::<c_void>()];
        }
    }

    /// Make content view first responder, show, and make key window.
    pub fn show_and_make_key(&self) {
        unsafe {
            if let Some(content_view) = self.ns_panel.contentView() {
                let responder: &NSResponder = &content_view;
                let _: bool = msg_send![&*self.ns_panel, makeFirstResponder: responder];
            }
            self.ns_panel.orderFrontRegardless();
            self.ns_panel.makeKeyWindow();
        }
    }

    /// Resign key window status (returns keyboard focus to previous app).
    pub fn resign_key_window(&self) {
        self.ns_panel.resignKeyWindow();
    }

    /// Set the window level (e.g., PanelLevel::MainMenu = 24).
    pub fn set_level(&self, level: i64) {
        unsafe {
            let _: () = msg_send![&*self.ns_panel, setLevel: level];
        }
    }

    /// Set the window style mask (NSWindowStyleMask raw value).
    pub fn set_style_mask(&self, mask: u64) {
        unsafe {
            let _: () = msg_send![&*self.ns_panel, setStyleMask: mask];
        }
    }

    /// Set the window collection behavior (NSWindowCollectionBehavior raw value).
    pub fn set_collection_behavior(&self, behavior: u64) {
        unsafe {
            let _: () = msg_send![&*self.ns_panel, setCollectionBehavior: behavior];
        }
    }

    /// Set whether the panel hides when the app deactivates.
    pub fn set_hides_on_deactivate(&self, value: bool) {
        unsafe {
            let _: () = msg_send![&*self.ns_panel, setHidesOnDeactivate: value];
        }
    }

    /// Check if the panel is currently visible.
    pub fn is_visible(&self) -> bool {
        self.ns_panel.isVisible()
    }

    #[allow(dead_code)]
    pub fn label(&self) -> &str {
        &self.label
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PanelStore — Tauri managed state for panel storage
// ─────────────────────────────────────────────────────────────────────────────

pub struct PanelStore(pub Mutex<HashMap<String, Arc<PanelHandle>>>);

impl PanelStore {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PanelExt — extension trait on AppHandle for panel access
// ─────────────────────────────────────────────────────────────────────────────

pub trait PanelExt {
    fn get_panel(&self, label: &str) -> Result<Arc<PanelHandle>, String>;
}

impl PanelExt for tauri::AppHandle {
    fn get_panel(&self, label: &str) -> Result<Arc<PanelHandle>, String> {
        let store = self.state::<PanelStore>();
        let map = store.0.lock().map_err(|e| e.to_string())?;
        map.get(label)
            .cloned()
            .ok_or_else(|| format!("Panel '{}' not found", label))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel type selector
// ─────────────────────────────────────────────────────────────────────────────

pub enum PanelType {
    /// Main window / HUD — can become key window for keyboard input
    Recopy,
    /// Preview overlay — cannot become key, no focus steal
    Preview,
}

// ─────────────────────────────────────────────────────────────────────────────
// convert_to_panel — isa-swizzle a Tauri window into NSPanel
// ─────────────────────────────────────────────────────────────────────────────

/// Convert a Tauri WebviewWindow to an NSPanel subclass via ObjC runtime class swizzling.
///
/// The window's underlying NSWindow object is reclassified as our custom NSPanel subclass.
/// This changes method dispatch (canBecomeKeyWindow, isFloatingPanel, etc.) without
/// reallocating the object. The panel is stored in PanelStore for later retrieval.
pub fn convert_to_panel(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    panel_type: PanelType,
    event_handler: Option<EventHandler>,
) -> Result<Arc<PanelHandle>, String> {
    // Get raw NSWindow pointer from Tauri
    let ns_window_ptr = window.ns_window().map_err(|e| e.to_string())?;
    let ns_window_obj = ns_window_ptr as *mut AnyObject;

    // Select the target ObjC class based on panel type
    let target_class = match panel_type {
        PanelType::Recopy => RawRecopyPanel::class() as *const _ as *const AnyClass,
        PanelType::Preview => RawPreviewPanel::class() as *const _ as *const AnyClass,
    };

    // Isa-swizzle: change the runtime class of the existing NSWindow object
    unsafe {
        object_setClass(ns_window_obj, target_class);
    }

    // Retain the pointer as NSPanel (safe because our subclasses inherit from NSPanel)
    let ns_panel: Retained<NSPanel> = unsafe {
        Retained::retain(ns_window_ptr as *mut NSPanel)
            .ok_or("Failed to retain NSPanel pointer")?
    };

    // Set the delegate if an event handler was provided
    if let Some(ref handler) = event_handler {
        unsafe {
            let delegate = handler.as_delegate();
            let _: () = msg_send![&*ns_panel, setDelegate: delegate];
        }
    }

    let label = window.label().to_string();
    let handle = Arc::new(PanelHandle {
        ns_panel,
        label: label.clone(),
        _event_handler: event_handler,
    });

    // Store in PanelStore for later retrieval via get_panel()
    let store = app.state::<PanelStore>();
    let mut map = store.0.lock().map_err(|e| e.to_string())?;
    map.insert(label, handle.clone());

    Ok(handle)
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder types — ergonomic wrappers for AppKit bitmask enums
// ─────────────────────────────────────────────────────────────────────────────

/// Window level constants matching NSWindowLevel values.
pub enum PanelLevel {
    MainMenu, // 24
    #[allow(dead_code)]
    Custom(i64),
}

impl PanelLevel {
    pub fn value(&self) -> i64 {
        match self {
            PanelLevel::MainMenu => 24,
            PanelLevel::Custom(v) => *v,
        }
    }
}

/// Builder for NSWindowStyleMask bitmask values.
pub struct StyleMask(u64);

impl StyleMask {
    pub fn empty() -> Self {
        Self(0)
    }

    /// NSWindowStyleMaskNonactivatingPanel (1 << 7) — clicking doesn't activate the app
    pub fn nonactivating_panel(self) -> Self {
        Self(self.0 | (1 << 7))
    }

    /// NSWindowStyleMaskResizable (1 << 3)
    pub fn resizable(self) -> Self {
        Self(self.0 | (1 << 3))
    }
}

impl From<StyleMask> for u64 {
    fn from(mask: StyleMask) -> u64 {
        mask.0
    }
}

/// Builder for NSWindowCollectionBehavior bitmask values.
pub struct CollectionBehavior(u64);

impl CollectionBehavior {
    pub fn new() -> Self {
        Self(0)
    }

    /// NSWindowCollectionBehaviorCanJoinAllSpaces (1 << 0)
    pub fn can_join_all_spaces(self) -> Self {
        Self(self.0 | (1 << 0))
    }

    /// NSWindowCollectionBehaviorMoveToActiveSpace (1 << 1)
    pub fn move_to_active_space(self) -> Self {
        Self(self.0 | (1 << 1))
    }

    /// NSWindowCollectionBehaviorStationary (1 << 4) — don't participate in Expose
    pub fn stationary(self) -> Self {
        Self(self.0 | (1 << 4))
    }

    /// NSWindowCollectionBehaviorIgnoresCycle (1 << 6) — don't show in Cmd+Tab
    pub fn ignores_cycle(self) -> Self {
        Self(self.0 | (1 << 6))
    }

    /// NSWindowCollectionBehaviorFullScreenAuxiliary (1 << 8)
    pub fn full_screen_auxiliary(self) -> Self {
        Self(self.0 | (1 << 8))
    }
}

impl From<CollectionBehavior> for u64 {
    fn from(behavior: CollectionBehavior) -> u64 {
        behavior.0
    }
}
