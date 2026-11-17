//! The visual contract a window is built to.
//!
//! `tauri.conf.json` declares the first window and a window created at runtime never passes
//! through that file, so the two only stay equal while these constants are the single source the
//! conf is checked against. The test in `tests.rs` reads the conf at test time and compares each
//! value with what the builder is handed, which is why nothing here is duplicated as a literal
//! elsewhere.

use tauri::Theme;

/// The title the conf declares and every runtime window carries.
pub const TITLE: &str = "quarry";

/// Initial width, in logical pixels.
pub const WIDTH: f64 = 1360.0;

/// Initial height, in logical pixels.
pub const HEIGHT: f64 = 880.0;

/// Smallest width the user can drag to.
pub const MIN_WIDTH: f64 = 960.0;

/// Smallest height the user can drag to.
pub const MIN_HEIGHT: f64 = 600.0;

/// The conf pins the dark appearance, so a window never follows the system theme.
pub const DARK: bool = true;

/// The conf's `hiddenTitle`: the title bar is an overlay, so the title itself is not drawn.
pub const HIDDEN_TITLE: bool = true;

/// The frontend entry a window loads. The conf declares no `url`, which means this same default.
pub const URL: &str = "index.html";

/// The theme to hand the builder, or `None` to let the system decide.
pub fn theme() -> Option<Theme> {
    if DARK { Some(Theme::Dark) } else { None }
}

/// The conf's `titleBarStyle`.
///
/// The builder can only apply it on macOS, but the value itself is the contract on every platform,
/// so the conf test compares against it everywhere; that is why it is also built when testing.
#[cfg(any(test, target_os = "macos"))]
pub fn title_bar_style() -> tauri::TitleBarStyle {
    tauri::TitleBarStyle::Overlay
}
