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

/// Read inlay hints out of a `textDocument/inlayHint` answer.
///
/// The answer may be `null` or an array. Each entry carries a `position` and a `label` that is
/// either a plain string or an array of `{ value }` parts. Entries whose label cannot be
/// flattened, or whose position is missing or malformed, are skipped.
pub fn parse_inlay_hints(result: &Value) -> Vec<InlayHint> {
    if result.is_null() {
        return Vec::new();
    }
    let Some(entries) = result.as_array() else {
        return Vec::new();
    };
    entries.iter().filter_map(parse_inlay_hint).collect()
}
pub fn parse_inlay_hint(value: &Value) -> Option<InlayHint> {
    let position = value.get("position")?;
    let line = position.get("line")?.as_u64()?;
    let character = position.get("character")?.as_u64()?;
    let label = flatten_inlay_label(value.get("label")?)?;
    Some(InlayHint {
        line: u32::try_from(line).ok()?,
        character: u32::try_from(character).ok()?,
        label,
        kind: value
            .get("kind")
            .and_then(Value::as_u64)
            .and_then(|kind| u32::try_from(kind).ok()),
    })
}

pub fn flatten_inlay_label(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Array(parts) => {
            let mut out = String::new();
            for part in parts {
                out.push_str(part.get("value").and_then(Value::as_str)?);
            }
            Some(out)
        }
        _ => None,
    }
}

#[tauri::command]
pub async fn lsp_call_hierarchy_prepare(
    state: State<'_, LspState>,
    root: String,
    path: String,
    line: u32,
    character: u32,
) -> Result<Vec<CallHierarchyNode>, String> {
    let session = session_for(&state, &root)?;
    let result = send_request(
        &session,
        "textDocument/prepareCallHierarchy",
        position_params(&path_to_uri(&path), line, character),
    )
    .await?;

    let mut guard = lock(&session);
    let mut out = Vec::new();
    if let Some(items) = result.as_array() {
        for item in items {
            if let Some(mut node) = call_hierarchy_node_from_item(item, 0) {
                let id = guard.next_call_hierarchy_id;
                guard.next_call_hierarchy_id += 1;
                guard.call_hierarchy_items.insert(id, item.clone());
                node.item_id = id;
                out.push(node);
            }
        }
    }
    Ok(out)
}
