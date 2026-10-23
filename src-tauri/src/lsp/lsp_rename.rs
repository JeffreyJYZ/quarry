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
pub async fn lsp_rename(
    state: State<'_, LspState>,
    root: String,
    path: String,
    line: u32,
    character: u32,
    new_name: String,
) -> Result<Vec<FileEdit>, String> {
    let session = session_for(&state, &root)?;
    let params = json!({
        "textDocument": { "uri": path_to_uri(&path) },
        "position": { "line": line, "character": character },
        "newName": new_name,
    });
    let result = send_request(&session, "textDocument/rename", params).await?;
    Ok(parse_workspace_edit(&result))
}

#[tauri::command]
pub async fn lsp_code_actions(
    state: State<'_, LspState>,
    root: String,
    path: String,
    line: u32,
    character: u32,
) -> Result<Vec<CodeAction>, String> {
    let session = session_for(&state, &root)?;
    let params = json!({
        "textDocument": { "uri": path_to_uri(&path) },
        "range": {
            "start": { "line": line, "character": character },
            "end": { "line": line, "character": character },
        },
        "context": { "diagnostics": [] },
    });
    let result = send_request(&session, "textDocument/codeAction", params).await?;
    Ok(parse_code_actions(&result))
}

/// Flatten a `WorkspaceEdit` into the IDE's `FileEdit` list.
///
/// Supports both `changes: { uri: TextEdit[] }` and
/// `documentChanges: [{ textDocument: { uri }, edits }]`. `create`/`rename`/`delete`
/// file operations are ignored; URIs that are not file URIs are skipped. A null
/// result reads as an empty vector.
pub fn parse_workspace_edit(result: &Value) -> Vec<FileEdit> {
    let mut out = Vec::new();
    if result.is_null() {
        return out;
    }

    if let Some(changes) = result.get("changes").and_then(Value::as_object) {
        for (uri, edits) in changes {
            let Some(path) = uri_to_path(uri) else {
                continue;
            };
            let mut file_edits = Vec::new();
            if let Some(entries) = edits.as_array() {
                for entry in entries {
                    if let Some(edit) = parse_text_edit(entry) {
                        file_edits.push(edit);
                    }
                }
            }
            if !file_edits.is_empty() {
                out.push(FileEdit {
                    path,
                    edits: file_edits,
                });
            }
        }
    }

    if let Some(document_changes) = result.get("documentChanges").and_then(Value::as_array) {
        for entry in document_changes {
            if entry.get("kind").is_some() {
                continue;
            }
            let uri = entry
                .get("textDocument")
                .and_then(|td| td.get("uri"))
                .and_then(Value::as_str)
                .or_else(|| entry.get("uri").and_then(Value::as_str));
            let Some(uri) = uri else {
                continue;
            };
            let Some(path) = uri_to_path(uri) else {
                continue;
            };
            let Some(edits) = entry.get("edits").and_then(Value::as_array) else {
                continue;
            };
            let mut file_edits = Vec::new();
            for edit_entry in edits {
                let candidate = edit_entry.get("textEdit").unwrap_or(edit_entry);
                if let Some(edit) = parse_text_edit(candidate) {
                    file_edits.push(edit);
                }
            }
            if !file_edits.is_empty() {
                out.push(FileEdit {
                    path,
                    edits: file_edits,
                });
            }
        }
    }

    out
}

pub fn parse_text_edit(value: &Value) -> Option<TextEdit> {
    let range = value.get("range")?;
    let new_text = value.get("newText").and_then(Value::as_str)?;
    Some(TextEdit {
        range: parse_range(range),
        new_text: new_text.to_string(),
    })
}
