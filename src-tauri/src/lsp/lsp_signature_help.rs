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

#[tauri::command]
pub async fn lsp_signature_help(
    state: State<'_, LspState>,
    root: String,
    path: String,
    line: u32,
    character: u32,
) -> Result<Option<SignatureHelp>, String> {
    let session = session_for(&state, &root)?;
    let result = send_request(
        &session,
        "textDocument/signatureHelp",
        position_params(&path_to_uri(&path), line, character),
    )
    .await?;
    Ok(parse_signature_help(&result))
}

/// Read a signature help answer into the IDE's shape.
///
/// A null result reads as `None`. Malformed signature entries are skipped. Both
/// active indices default to 0 when the server omits them. `documentation` may
/// be a plain string or a `{ kind, value }` / `{ language, value }` object and
/// is flattened the same way hover contents are.
pub fn parse_signature_help(result: &Value) -> Option<SignatureHelp> {
    if result.is_null() {
        return None;
    }
    let signatures_value = result.get("signatures").and_then(Value::as_array)?;
    let mut signatures = Vec::new();
    for entry in signatures_value {
        let Some(label) = entry.get("label").and_then(Value::as_str) else {
            continue;
        };
        let documentation = entry
            .get("documentation")
            .map(hover_contents)
            .filter(|text| !text.is_empty());
        signatures.push(SignatureInformation {
            label: label.to_string(),
            documentation,
        });
    }
    Some(SignatureHelp {
        signatures,
        active_signature: result
            .get("activeSignature")
            .and_then(Value::as_u64)
            .and_then(|n| u32::try_from(n).ok())
            .unwrap_or(0),
        active_parameter: result
            .get("activeParameter")
            .and_then(Value::as_u64)
            .and_then(|n| u32::try_from(n).ok())
            .unwrap_or(0),
    })
}

/// Inlay hints for one document.
#[tauri::command]
pub async fn lsp_inlay_hints(
    state: State<'_, LspState>,
    root: String,
    path: String,
) -> Result<Vec<InlayHint>, String> {
    let session = session_for(&state, &root)?;
    let end = {
        let guard = lock(&session);
        match guard.document_ends.get(&path).copied() {
            Some(end) => end,
            None => return Ok(Vec::new()),
        }
    };
    let result = send_request(
        &session,
        "textDocument/inlayHint",
        json!({
            "textDocument": { "uri": path_to_uri(&path) },
            "range": {
                "start": { "line": 0, "character": 0 },
                "end": { "line": end.line, "character": end.character },
            },
        }),
    )
    .await?;
    Ok(parse_inlay_hints(&result))
}

/// Compute the LSP end position of a document from its text.
///
/// Line and character counts follow LSP: lines are separated by `\\n`, and
/// characters are UTF-16 code units.
pub fn document_end(text: &str) -> Position {
    let lines: Vec<&str> = text.split('\n').collect();
    let line = lines.len().saturating_sub(1) as u32;
    let last = lines.last().copied().unwrap_or("");
    let character = last.chars().map(|c| c.len_utf16() as u32).sum();
    Position { line, character }
}
