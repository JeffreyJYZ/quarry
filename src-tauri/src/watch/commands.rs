//! The two commands the frontend calls: start watching a project root, stop watching.

use super::*;

/// Start (or replace) the watcher for `root`. Rejects a root the OS refuses to watch.
#[tauri::command]
pub fn watch_start(
    app: AppHandle,
    state: State<'_, WatchState>,
    root: String,
) -> Result<(), String> {
    state.start(app, root)
}

/// Stop the watcher. Safe to call when none is running.
#[tauri::command]
pub fn watch_stop(state: State<'_, WatchState>) {
    state.stop();
}
