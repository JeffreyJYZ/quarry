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

/// `initialize` out, wait for its response, `initialized` out.
///
/// While waiting, server-to-client requests are answered, because a server that asks about
/// configuration before replying would otherwise deadlock against our own wait.
pub fn handshake(pipe: &mut ProcessPipe, root_uri: &str, name: &str) -> Result<(), String> {
    let params = json!({
        "processId": std::process::id(),
        "rootUri": root_uri,
        "capabilities": client_capabilities(),
        "workspaceFolders": [{ "uri": root_uri, "name": name }],
    });
    pipe.send(&request(INITIALIZE_ID, "initialize", params))
        .map_err(|error| format!("cannot send initialize: {error}"))?;

    let deadline = Instant::now() + HANDSHAKE_TIMEOUT;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(format!(
                "did not answer initialize within {}s",
                HANDSHAKE_TIMEOUT.as_secs()
            ));
        }

        match pipe.frames.recv_timeout(remaining) {
            Ok(Ok(message)) => {
                let is_response = message.get("method").is_none();
                if is_response && message.get("id") == Some(&json!(INITIALIZE_ID)) {
                    if let Some(error) = message.get("error") {
                        return Err(format!("rejected initialize: {error}"));
                    }
                    break;
                }
                if !is_response && message.get("id").is_some() {
                    let _ = pipe.send(&server_request_response(&message));
                }
            }
            Ok(Err(error)) => {
                return Err(format!("stopped before answering initialize: {error}"));
            }
            Err(RecvTimeoutError::Timeout) => {
                return Err(format!(
                    "did not answer initialize within {}s",
                    HANDSHAKE_TIMEOUT.as_secs()
                ));
            }
            Err(RecvTimeoutError::Disconnected) => {
                return Err("exited before answering initialize".to_string());
            }
        }
    }

    pipe.send(&notification("initialized", json!({})))
        .map_err(|error| format!("cannot send initialized: {error}"))
}
/// Read frames until the child goes away, forwarding diagnostics and keeping the server unblocked.
pub fn pump(
    app: AppHandle,
    root: String,
    frames: Receiver<Result<Value, FrameError>>,
    session: Arc<Mutex<Session>>,
) {
    for frame in frames {
        let Ok(message) = frame else {
            break;
        };

        // A response to one of our own requests: resolve it before handling any notification.
        if message.get("method").is_none() {
            resolve_response(&session, &message);
            continue;
        }

        let Some(method) = message.get("method").and_then(Value::as_str) else {
            continue;
        };

        if method == "textDocument/publishDiagnostics" {
            if let Some(event) = diagnostics_event(&root, message.get("params")) {
                emit_diagnostics(&app, event);
            }
            continue;
        }

        if message.get("id").is_some() {
            let response = server_request_response(&message);
            if lock(&session).pipe.send(&response).is_err() {
                break;
            }
        }
    }
}
