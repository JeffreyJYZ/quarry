//! New Window: one process, several windows of the same frontend.
//!
//! Every window shows the same app, so a window is created from [`contract`] rather than from
//! `tauri.conf.json` — the conf only ever declares the first one. Creation is a plain function over
//! the handle so the menu can call it directly, without a round trip through a webview that may be
//! busy; the [`new_window`] command is the same call for the frontend. The command keeps its own
//! name rather than a Rust-idiomatic one plus `rename`, because the repo's own check matches
//! `#[tauri::command]` function names against `generate_handler!`.

mod contract;
mod labels;

#[cfg(test)]
mod tests;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub use contract::*;
pub use labels::next_label;

#[cfg(test)]
pub use labels::MAIN_LABEL;

/// Creates a window showing the same frontend as the conf's window, and returns its label.
///
/// The label is picked from the windows currently alive, so two quick invocations cannot collide.
pub fn open_window(app: &AppHandle) -> Result<String, String> {
    let live: Vec<String> = app.webview_windows().keys().cloned().collect();
    let label = next_label(&live);

    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(URL.into()))
        .title(TITLE)
        .inner_size(WIDTH, HEIGHT)
        .min_inner_size(MIN_WIDTH, MIN_HEIGHT)
        .theme(contract::theme());

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(contract::title_bar_style())
            .hidden_title(HIDDEN_TITLE);
    }

    builder
        .build()
        .map(|_| label)
        .map_err(|error| format!("could not open a window: {error}"))
}

/// The command form of [`open_window`], registered as `new_window`.
#[tauri::command]
pub fn new_window(app: AppHandle) -> Result<String, String> {
    open_window(&app)
}
