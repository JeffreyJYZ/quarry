//! Stops every child the app owns, from one place.
//!
//! A language server, debug adapter, shell, program or file watcher keeps the process group alive,
//! which is what makes macOS report quarry as still running after its window is gone. The
//! window-destroyed path and the exit path both go through [`Children::shutdown`], so the two
//! cannot drift, and every state drains its own map, so stopping an already-stopped set is a no-op.

use crate::dap::DapState;
use crate::lsp::LspState;
use crate::pty::PtyState;
use crate::run_task::RunState;
use crate::watch::WatchState;
use tauri::{AppHandle, Manager, Runtime};

#[cfg(test)]
mod tests;

/// The five managed states that own child processes.
pub struct Children<'a> {
    lsp: &'a LspState,
    dap: &'a DapState,
    pty: &'a PtyState,
    run: &'a RunState,
    watch: &'a WatchState,
}

impl<'a> Children<'a> {
    /// Reads the managed states back from the handle.
    pub fn of<R: Runtime>(app: &'a AppHandle<R>) -> Self {
        Self {
            lsp: app.state::<LspState>().inner(),
            dap: app.state::<DapState>().inner(),
            pty: app.state::<PtyState>().inner(),
            run: app.state::<RunState>().inner(),
            watch: app.state::<WatchState>().inner(),
        }
    }

    /// Stops all five. Runs when the last window is destroyed and again on app exit, so every
    /// `shutdown_all` has to stay idempotent: each drains its own map or takes its handle.
    pub fn shutdown(&self) {
        self.lsp.shutdown_all();
        self.dap.shutdown_all();
        self.pty.shutdown_all();
        self.run.shutdown_all();
        self.watch.shutdown_all();
    }
}

/// True when closing `closed` leaves no window behind. macOS keeps the process alive after that,
/// so the children have to go down with the window.
pub fn closing_last_window<R: Runtime>(app: &AppHandle<R>, closed: &str) -> bool {
    !app.webview_windows().keys().any(|label| label != closed)
}
