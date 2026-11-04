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
/// The server's semantic-token legend: the names its token numbers and bits refer to.
pub struct SemanticLegend {
    pub types: Vec<String>,
    pub modifiers: Vec<String>,
}

pub fn handshake(
    pipe: &mut ProcessPipe,
    root_uri: &str,
    name: &str,
) -> Result<SemanticLegend, String> {
    let params = json!({
        "processId": std::process::id(),
        "rootUri": root_uri,
        "capabilities": client_capabilities(),
        "workspaceFolders": [{ "uri": root_uri, "name": name }],
    });
    pipe.send(&request(INITIALIZE_ID, "initialize", params))
        .map_err(|error| format!("cannot send initialize: {error}"))?;

    // The server's own legend, in the order its token indices refer to. Semantic highlighting is
    // useless without it: the numbers in a token are positions in *this* list.
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
                    let legend = SemanticLegend {
                        types: legend_field(&message, "tokenTypes"),
                        modifiers: legend_field(&message, "tokenModifiers"),
                    };
                    pipe.send(&notification("initialized", json!({})))
                        .map_err(|error| format!("cannot send initialized: {error}"))?;
                    return Ok(legend);
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
}

/// One array of the semantic-token legend out of an `initialize` response.
fn legend_field(message: &Value, key: &str) -> Vec<String> {
    message
        .get("result")
        .and_then(|result| result.get("capabilities"))
        .and_then(|capabilities| capabilities.get("semanticTokensProvider"))
        .and_then(|provider| provider.get("legend"))
        .and_then(|legend| legend.get(key))
        .and_then(Value::as_array)
        .map(|names| {
            names
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
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
            let mut guard = lock(&session);
            if guard.pipe.send(&response).is_err() {
                guard.dead = true;
                drop(guard);
                break;
            }
        }
    }
}
