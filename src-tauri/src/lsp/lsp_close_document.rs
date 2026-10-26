#![allow(unused_imports)]

pub(crate) use crate::project::open_project;
pub(crate) use crate::protocol_pipe::{FrameError, ProcessPipe};
pub(crate) use crate::resolve;
pub(crate) use crate::types::{
    CallHierarchyNode, CodeAction, CompletionItem, CompletionList, Diagnostic, DiagnosticsEvent,
    FileEdit, HoverInfo, InlayHint, Location, LspStatus, Position, ProjectKind, Range,
    SignatureHelp, SignatureInformation, Symbol, TextEdit, WorkspaceSymbol,
};
pub use serde::Serialize;
pub use serde_json::{Value, json};
pub use std::collections::HashMap;
pub use std::path::Path;
pub use std::process::Command;
pub use std::sync::mpsc::{Receiver, RecvTimeoutError};
pub use std::sync::{Arc, Mutex, MutexGuard};
pub use std::thread;
pub use std::time::{Duration, Instant};
pub use tauri::{AppHandle, State};
pub use tokio::sync::oneshot;

use super::*;

/// Tells the server the buffer was written to disk.
///
/// rust-analyzer runs its checker (`cargo check`) on save, and that is where type errors and most
/// cross-file findings come from. Without this notification a clean `didOpen` stream produces only
/// syntax diagnostics, which is why a file full of type errors looked "unchecked".
#[tauri::command]
pub async fn lsp_did_save(
    state: State<'_, LspState>,
    root: String,
    path: String,
) -> Result<(), String> {
    let session = session_for(&state, &root)?;
    let mut session = lock(&session);

    let message = notification(
        "textDocument/didSave",
        json!({ "textDocument": { "uri": path_to_uri(&path) } }),
    );
    send(&mut session, "textDocument/didSave", &message)
}
#[tauri::command]
pub async fn lsp_close_document(
    state: State<'_, LspState>,
    root: String,
    path: String,
) -> Result<(), String> {
    let session = session_for(&state, &root)?;
    let mut session = lock(&session);

    session.documents.remove(&path);
    session.document_ends.remove(&path);
    session.document_texts.remove(&path);

    let message = notification(
        "textDocument/didClose",
        json!({ "textDocument": { "uri": path_to_uri(&path) } }),
    );
    send(&mut session, "textDocument/didClose", &message)
}

/// Emit helper the unit must keep so the payload shape stays in one place.
pub fn emit_diagnostics(app: &AppHandle, payload: DiagnosticsEvent) {
    use tauri::Emitter;
    let _ = app.emit("lsp://diagnostics", payload);
}

/// The only writer of a session mutex that is allowed to fail on a poisoned lock: a panicking
/// reader thread must not turn every later document command into an error.
pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poison| poison.into_inner())
}

pub fn session_for(state: &LspState, root: &str) -> Result<Arc<Mutex<Session>>, String> {
    let session = lock(&state.sessions)
        .get(root)
        .cloned()
        .ok_or_else(|| format!("no language server session for {root}"))?;
    if lock(&session).dead {
        return Err(format!("language server session for {root} is dead"));
    }
    Ok(session)
}

pub fn send(session: &mut Session, method: &str, message: &Value) -> Result<(), String> {
    session
        .pipe
        .send(message)
        .map_err(|error| format!("{}: cannot send {method}: {error}", session.server))
}

pub fn request(id: i64, method: &str, params: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
}

pub fn notification(method: &str, params: Value) -> Value {
    json!({ "jsonrpc": "2.0", "method": method, "params": params })
}
