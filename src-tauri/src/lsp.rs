//! One language-server session per project root.
//!
//! Unit U6 owns the body of this file. Contract: spawn the server for the project kind with
//! `protocol_pipe`, perform the `initialize` / `initialized` handshake, synchronise documents with
//! full-document `didOpen` / `didChange` / `didClose`, and forward `textDocument/publishDiagnostics`
//! as the `lsp://diagnostics` event (payload `DiagnosticsEvent`). No completion, hover or navigation
//! in this slice. Never write into the source tree, never bundle a server.

use crate::types::{DiagnosticsEvent, LspStatus};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, State};

/// Held by Tauri as managed state; one entry per project root.
#[derive(Default)]
pub struct LspState {
    /// STUB: U6 replaces the value with a real session.
    pub sessions: Mutex<HashMap<String, ()>>,
}

#[tauri::command]
pub async fn start_lsp(
    _app: AppHandle,
    _state: State<'_, LspState>,
    root: String,
) -> Result<LspStatus, String> {
    // STUB: U6 replaces this.
    Err(format!("no language server started for {root}"))
}

#[tauri::command]
pub async fn stop_lsp(_state: State<'_, LspState>, _root: String) -> Result<(), String> {
    // STUB: U6 replaces this.
    Err("no language server to stop".to_string())
}

#[tauri::command]
pub async fn lsp_open_document(
    _state: State<'_, LspState>,
    _root: String,
    _path: String,
    _text: String,
) -> Result<(), String> {
    // STUB: U6 replaces this.
    Err("no language server session".to_string())
}

#[tauri::command]
pub async fn lsp_change_document(
    _state: State<'_, LspState>,
    _root: String,
    _path: String,
    _text: String,
) -> Result<(), String> {
    // STUB: U6 replaces this.
    Err("no language server session".to_string())
}

#[tauri::command]
pub async fn lsp_close_document(
    _state: State<'_, LspState>,
    _root: String,
    _path: String,
) -> Result<(), String> {
    // STUB: U6 replaces this.
    Err("no language server session".to_string())
}

/// Emit helper the unit must keep so the payload shape stays in one place.
#[allow(dead_code)]
pub fn emit_diagnostics(app: &AppHandle, payload: DiagnosticsEvent) {
    use tauri::Emitter;
    let _ = app.emit("lsp://diagnostics", payload);
}
