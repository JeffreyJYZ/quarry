//! What a menu click does.
//!
//! Almost every row goes to the frontend as `menu-command`, because the action needs editor state.
//! The exceptions are handled here: opening a window must work even when the focused webview is
//! busy or has no listener left, so it never travels through an event.

use tauri::{AppHandle, Emitter};

/// The rows the frontend owns, by id.
const FORWARDED: [&str; 21] = [
    "check-updates",
    "open-settings",
    "new-project",
    "open-project",
    "save",
    "save-all",
    "find-in-project",
    "quick-open",
    "toggle-rail",
    "toggle-dock",
    "toggle-terminal",
    "toggle-source-control",
    "toggle-debug",
    "toggle-blame",
    "show-shortcuts",
    "build",
    "run",
    "stop-run",
    "run-to-cursor",
    "refresh-git",
    "reveal-active-file",
];

pub fn on_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let id = event.id().0.as_str();
    if id == "new-window" {
        if let Err(error) = crate::windows::new_window(app) {
            eprintln!("quarry: {error}");
        }
        return;
    }
    if FORWARDED.contains(&id) {
        let _ = app.emit("menu-command", id.to_string());
    }
}
