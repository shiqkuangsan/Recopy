#[cfg(target_os = "macos")]
pub mod nspanel;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::*;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod fallback;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub use fallback::*;

pub(crate) fn preview_top_inset_for_target(menu_h: f64, reserve_safe_top: bool) -> f64 {
    if reserve_safe_top {
        if menu_h > 0.0 {
            menu_h
        } else {
            37.0
        }
    } else {
        0.0
    }
}

pub fn platform_preview_top_inset() -> f64 {
    preview_top_inset_for_target(platform_menu_bar_height(), cfg!(target_os = "macos"))
}

#[cfg_attr(target_os = "macos", allow(dead_code))]
pub(crate) fn should_hide_after_recopy_focus_check(
    main_focused: bool,
    preview_focused: bool,
) -> bool {
    !main_focused && !preview_focused
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct RectI32 {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl RectI32 {
    #[allow(dead_code)]
    pub fn width(self) -> i32 {
        self.right - self.left
    }

    #[allow(dead_code)]
    pub fn height(self) -> i32 {
        self.bottom - self.top
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(crate) struct FrameOffsets {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub(crate) fn outer_rect_for_visible_rect(
    desired_visible: RectI32,
    offsets: FrameOffsets,
) -> RectI32 {
    RectI32 {
        left: desired_visible.left - offsets.left,
        top: desired_visible.top - offsets.top,
        right: desired_visible.right + offsets.right,
        bottom: desired_visible.bottom + offsets.bottom,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        outer_rect_for_visible_rect, preview_top_inset_for_target,
        should_hide_after_recopy_focus_check, FrameOffsets, RectI32,
    };

    #[test]
    fn preview_top_inset_is_zero_when_safe_top_is_not_reserved() {
        assert_eq!(preview_top_inset_for_target(0.0, false), 0.0);
        assert_eq!(preview_top_inset_for_target(28.0, false), 0.0);
    }

    #[test]
    fn preview_top_inset_preserves_macos_fallback() {
        assert_eq!(preview_top_inset_for_target(0.0, true), 37.0);
        assert_eq!(preview_top_inset_for_target(28.0, true), 28.0);
    }

    #[test]
    fn focus_group_stays_open_when_any_recopy_window_is_focused() {
        assert!(!should_hide_after_recopy_focus_check(true, false));
        assert!(!should_hide_after_recopy_focus_check(false, true));
    }

    #[test]
    fn focus_group_hides_when_all_recopy_windows_are_unfocused() {
        assert!(should_hide_after_recopy_focus_check(false, false));
    }

    #[test]
    fn outer_rect_compensates_windows_invisible_frame() {
        let desired_visible = RectI32 {
            left: 0,
            top: 47,
            right: 1280,
            bottom: 427,
        };
        let offsets = FrameOffsets {
            left: 5,
            top: 7,
            right: 5,
            bottom: 5,
        };

        assert_eq!(
            outer_rect_for_visible_rect(desired_visible, offsets),
            RectI32 {
                left: -5,
                top: 40,
                right: 1285,
                bottom: 432,
            },
        );
    }
}
