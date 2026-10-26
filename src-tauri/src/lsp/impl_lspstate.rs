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

impl LspState {
    /// Stops every language server; used on exit so no child outlives the window.
    pub fn shutdown_all(&self) {
        let sessions: Vec<_> = lock(&self.sessions)
            .drain()
            .map(|(_, session)| session)
            .collect();
        for session in sessions {
            lock(&session).stop();
        }
    }
}

#[tauri::command]
pub async fn stop_lsp(state: State<'_, LspState>, root: String) -> Result<(), String> {
    let session = lock(&state.sessions).remove(&root);
    let Some(session) = session else {
        return Ok(());
    };

    lock(&session).stop();
    Ok(())
}

#[tauri::command]
pub async fn lsp_open_document(
    state: State<'_, LspState>,
    root: String,
    path: String,
    text: String,
) -> Result<(), String> {
    let session = session_for(&state, &root)?;
    let mut session = lock(&session);

    let version = 1;
    session.documents.insert(path.clone(), version);
    session
        .document_ends
        .insert(path.clone(), document_end(&text));
    session.document_texts.insert(path.clone(), text.clone());

    let message = notification(
        "textDocument/didOpen",
        json!({
            "textDocument": {
                "uri": path_to_uri(&path),
                "languageId": language_id(&path),
                "version": version,
                "text": text,
            }
        }),
    );
    send(&mut session, "textDocument/didOpen", &message)?;

    // Opening a file should check it, the way CLion analyses on open: rust-analyzer's type findings
    // come from `cargo check`, so ask for one run now instead of waiting for a save.
    let check = request(
        0,
        "workspace/executeCommand",
        json!({ "command": "rust-analyzer.runFlycheck", "arguments": [] }),
    );
    let mut check = check;
    // A notification carries no id, so the server never wants an answer.
    if let Some(object) = check.as_object_mut() {
        object.remove("id");
    }
    let _ = send(&mut session, "workspace/executeCommand", &check);
    Ok(())
}

#[tauri::command]
pub async fn lsp_change_document(
    state: State<'_, LspState>,
    root: String,
    path: String,
    text: String,
) -> Result<(), String> {
    let session = session_for(&state, &root)?;
    let mut session = lock(&session);

    let old_text = session
        .document_texts
        .get(&path)
        .cloned()
        .unwrap_or_default();
    if old_text == text {
        // identical: no send
        let v = session.documents.get(&path).copied().unwrap_or(0);
        session.documents.insert(path.clone(), v);
        return Ok(());
    }

    let version = session.documents.get(&path).copied().unwrap_or(0) + 1;
    session.documents.insert(path.clone(), version);
    session
        .document_ends
        .insert(path.clone(), document_end(&text));
    session.document_texts.insert(path.clone(), text.clone());

    let message = if let Some(range) = incremental_range(&old_text, &text) {
        // replacement text is the tail of `new` from the first differing utf-16 position
        let old_u: Vec<u16> = old_text.encode_utf16().collect();
        let new_u: Vec<u16> = text.encode_utf16().collect();
        let mut p = 0usize;
        while p < old_u.len() && p < new_u.len() && old_u[p] == new_u[p] {
            p += 1;
        }
        let new_text = String::from_utf16_lossy(&new_u[p..]);
        notification(
            "textDocument/didChange",
            json!({
                "textDocument": { "uri": path_to_uri(&path), "version": version },
                "contentChanges": [{ "range": range, "text": new_text }],
            }),
        )
    } else {
        notification(
            "textDocument/didChange",
            json!({
                "textDocument": { "uri": path_to_uri(&path), "version": version },
                "contentChanges": [{ "text": text }],
            }),
        )
    };
    send(&mut session, "textDocument/didChange", &message)
}

#[tauri::command]
pub async fn lsp_execute_command(
    state: State<'_, LspState>,
    root: String,
    command: String,
    arguments: Option<Vec<Value>>,
) -> Result<Value, String> {
    let session = session_for(&state, &root)?;
    let args = arguments.unwrap_or_default();
    send_request(
        &session,
        "workspace/executeCommand",
        json!({ "command": command, "arguments": args }),
    )
    .await
}
