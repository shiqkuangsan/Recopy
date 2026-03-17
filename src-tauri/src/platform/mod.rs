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

#[cfg(test)]
mod tests {
    use super::preview_top_inset_for_target;

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
}
