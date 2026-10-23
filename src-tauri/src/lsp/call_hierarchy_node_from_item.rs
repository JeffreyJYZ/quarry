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

/// `direction` is `incoming` or `outgoing`.
#[tauri::command]
pub async fn lsp_call_hierarchy_calls(
    state: State<'_, LspState>,
    root: String,
    item_id: u32,
    direction: String,
) -> Result<Vec<CallHierarchyNode>, String> {
    if direction != "incoming" && direction != "outgoing" {
        return Err(format!(
            "direction must be \"incoming\" or \"outgoing\", got {direction}"
        ));
    }

    let session = session_for(&state, &root)?;
    let raw_item = {
        let guard = lock(&session);
        guard
            .call_hierarchy_items
            .get(&item_id)
            .cloned()
            .ok_or_else(|| format!("unknown call hierarchy item id {item_id}"))?
    };

    let method = if direction == "incoming" {
        "callHierarchy/incomingCalls"
    } else {
        "callHierarchy/outgoingCalls"
    };
    let source_key = if direction == "incoming" {
        "from"
    } else {
        "to"
    };

    let result = send_request(&session, method, json!({ "item": raw_item })).await?;

    let mut guard = lock(&session);
    let mut out = Vec::new();
    if let Some(entries) = result.as_array() {
        for entry in entries {
            let Some(source) = entry.get(source_key) else {
                continue;
            };
            if let Some(mut node) = call_hierarchy_node_from_item(source, 0) {
                let id = guard.next_call_hierarchy_id;
                guard.next_call_hierarchy_id += 1;
                guard.call_hierarchy_items.insert(id, source.clone());
                node.item_id = id;
                out.push(node);
            }
        }
    }
    Ok(out)
}
pub fn call_hierarchy_node_from_item(item: &Value, _item_id: u32) -> Option<CallHierarchyNode> {
    let name = item.get("name").and_then(Value::as_str)?;
    if name.is_empty() {
        return None;
    }
    let kind = item
        .get("kind")
        .and_then(Value::as_u64)
        .and_then(|kind| u32::try_from(kind).ok())
        .unwrap_or(0);
    let uri = item.get("uri").and_then(Value::as_str)?;
    let path = uri_to_path(uri)?;
    if !path.starts_with('/') {
        return None;
    }
    let range_value = item.get("selectionRange").or_else(|| item.get("range"))?;
    let start = range_value.get("start")?;
    let line = start
        .get("line")
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
        .unwrap_or(0);
    let character = start
        .get("character")
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
        .unwrap_or(0);
    Some(CallHierarchyNode {
        name: name.to_string(),
        kind,
        path,
        line,
        character,
        item_id: 0,
    })
}

/// Pure mapping helper for tests: map a `prepareCallHierarchy` result.
#[allow(dead_code)] // test-fixture helper, not wired into production path
pub fn parse_call_hierarchy_prepare(result: &Value) -> Vec<CallHierarchyNode> {
    let mut out = Vec::new();
    if let Some(items) = result.as_array() {
        for item in items {
            if let Some(node) = call_hierarchy_node_from_item(item, 0) {
                out.push(node);
            }
        }
    } else if result.is_null() {
    }
    out
}

/// Pure mapping helper for tests: map an incoming/outgoing calls result.
#[allow(dead_code)] // test-fixture helper, not wired into production path
pub fn parse_call_hierarchy_calls(result: &Value, incoming: bool) -> Vec<CallHierarchyNode> {
    let source_key = if incoming { "from" } else { "to" };
    let mut out = Vec::new();
    if let Some(entries) = result.as_array() {
        for entry in entries {
            if let Some(source) = entry.get(source_key)
                && let Some(node) = call_hierarchy_node_from_item(source, 0)
            {
                out.push(node);
            }
        }
    }
    out
}

/// Ranges of the same symbol under the cursor, for occurrence highlighting.
#[tauri::command]
pub async fn lsp_document_highlights(
    state: State<'_, LspState>,
    root: String,
    path: String,
    line: u32,
    character: u32,
) -> Result<Vec<Range>, String> {
    let session = session_for(&state, &root)?;
    let result = send_request(
        &session,
        "textDocument/documentHighlight",
        position_params(&path_to_uri(&path), line, character),
    )
    .await?;
    Ok(parse_document_highlights(&result))
}

/// Read the ranges out of a `textDocument/documentHighlight` answer.
///
/// The answer is `null` or an array of `{ range, kind? }` entries. `kind` is ignored: the editor
/// styles every occurrence the same way. Entries without a usable `range` are skipped, and a null
/// answer reads as an empty vector.
pub fn parse_document_highlights(result: &Value) -> Vec<Range> {
    if result.is_null() {
        return Vec::new();
    }
    let Some(entries) = result.as_array() else {
        return Vec::new();
    };
    entries
        .iter()
        .filter_map(parse_document_highlight)
        .collect()
}

pub fn parse_document_highlight(value: &Value) -> Option<Range> {
    let range = value.get("range")?;
    // Require both endpoints to be objects with line/character numbers.
    let start = range.get("start")?;
    let end = range.get("end")?;
    if !start.is_object() || !end.is_object() {
        return None;
    }
    Some(parse_range(range))
}
