//! The one call site: wires the Dock item to this app's New Window.
//!
//! [`install`](super::install) takes a callback so the Dock module compiles and tests without the
//! window code. This is the file that supplies the real one, which keeps `lib.rs` a single line
//! instead of a closure plus two error paths.

use tauri::AppHandle;

/// Registers the Dock menu, opening a window when its item is chosen.
///
/// A failure is reported and swallowed: the Dock menu is an extra route to New Window, never a
/// requirement for the app to start.
pub fn install_for(app: &AppHandle) {
    let handle = app.clone();
    let result = super::install(app, move || {
        if let Err(error) = crate::windows::open_window(&handle) {
            crate::logging::write(
                crate::logging::Level::Error,
                "dock",
                &format!("dock New Window failed: {error}"),
            );
        }
    });
    if let Err(error) = result {
        crate::logging::write(
            crate::logging::Level::Error,
            "dock",
            &format!("dock menu unavailable: {error}"),
        );
    }
}
