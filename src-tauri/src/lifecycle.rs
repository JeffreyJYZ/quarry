//! What the shell does when a window goes away.
//!
//! A live shell, language server, adapter, program or build keeps the process group alive, which is
//! what makes macOS report quarry as still running after its window is gone. macOS does not quit on
//! the last window close, so the children are taken down with the window itself rather than only on
//! exit — both paths go through the same [`shutdown::Children`] so they cannot drift.
//!
//! The app can hold several windows of the same frontend, and the children belong to the process
//! rather than to any one of them: closing a second window leaves the servers and shells of the
//! others alone, and only the last close takes them down. That rule is
//! [`shutdown::closes_last_window`], pure so it is pinned by a test without an event loop.

use crate::shutdown;
use crate::startup::{process_start, startup_enabled};
use tauri::{AppHandle, RunEvent, Runtime};

/// Handles one run event. Installed as the closure `.run(...)` would otherwise hold.
pub fn on_run_event<R: Runtime>(handle: &AppHandle<R>, event: RunEvent) {
    match event {
        RunEvent::Ready => {
            if startup_enabled() {
                eprintln!(
                    "quarry startup: window-ready +{}ms",
                    process_start().elapsed().as_millis()
                );
            }
        }
        RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::Destroyed,
            ..
        } => {
            if shutdown::closing_last_window(handle, &label) {
                shutdown::Children::of(handle).shutdown();
            }
        }
        RunEvent::ExitRequested { .. } | RunEvent::Exit => {
            shutdown::Children::of(handle).shutdown();
        }
        _ => {}
    }
}
