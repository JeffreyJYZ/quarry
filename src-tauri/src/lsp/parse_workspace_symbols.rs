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

/// Project-wide symbol search (`workspace/symbol`), the backend for "go to class".
#[tauri::command]
pub async fn lsp_workspace_symbols(
    state: State<'_, LspState>,
    root: String,
    query: String,
) -> Result<Vec<WorkspaceSymbol>, String> {
    let session = session_for(&state, &root)?;
    let result = send_request(&session, "workspace/symbol", json!({ "query": query })).await?;
    Ok(parse_workspace_symbols(&result))
}
/// Flattens a `workspace/symbol` answer.
///
/// The server may send `SymbolInformation` (a `location` with a range) or `WorkspaceSymbol`
/// (a `location` that is a `{ uri }` in 3.17). An entry with no range still gets a row, pointing
/// at the top of the file, because dropping it would hide a real result.
pub fn parse_workspace_symbols(result: &Value) -> Vec<WorkspaceSymbol> {
    let Some(entries) = result.as_array() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries {
        let Some(name) = entry.get("name").and_then(Value::as_str) else {
            continue;
        };
        if name.is_empty() {
            continue;
        }
        let Some(location) = entry.get("location") else {
            continue;
        };
        let Some(uri) = location.get("uri").and_then(Value::as_str) else {
            continue;
        };
        let Some(path) = uri_to_path(uri) else {
            continue;
        };
        let start = location.get("range").map(|range| parse_range(range).start);
        out.push(WorkspaceSymbol {
            name: name.to_string(),
            kind: entry
                .get("kind")
                .and_then(Value::as_u64)
                .and_then(|kind| u32::try_from(kind).ok())
                .unwrap_or(0),
            container: entry
                .get("containerName")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            path,
            line: start.map(|position| position.line).unwrap_or(0),
            character: start.map(|position| position.character).unwrap_or(0),
        });
    }
    out
}

/// Read the symbols out of a `textDocument/documentSymbol` answer.
/// The server may answer with `DocumentSymbol[]` (nested via `children`) or
/// `SymbolInformation[]` (flat, with `location`). Both are flattened into one list,
/// with `depth` reflecting the nesting level.
pub fn parse_symbols(result: &Value) -> Vec<Symbol> {
    let mut out = Vec::new();
    match result {
        Value::Null => {}
        Value::Array(entries) => {
            for entry in entries {
                if entry.get("location").is_some() {
                    if let Some(symbol) = parse_symbol_information(entry) {
                        out.push(symbol);
                    }
                } else {
                    collect_document_symbols(entry, 0, &mut out);
                }
            }
        }
        _ => {}
    }
    out
}

pub fn parse_symbol_information(value: &Value) -> Option<Symbol> {
    let name = value.get("name").and_then(Value::as_str)?;
    if name.is_empty() {
        return None;
    }
    let range_value = value.get("location")?.get("range")?;
    Some(Symbol {
        name: name.to_string(),
        kind: value
            .get("kind")
            .and_then(Value::as_u64)
            .and_then(|kind| u32::try_from(kind).ok())
            .unwrap_or(0),
        range: parse_range(range_value),
        depth: 0,
    })
}

pub fn collect_document_symbols(value: &Value, depth: u32, out: &mut Vec<Symbol>) {
    let Some(object) = value.as_object() else {
        return;
    };
    let name = object.get("name").and_then(Value::as_str);
    let range_value = object.get("range");
    if let (Some(name), Some(range_value)) = (name, range_value)
        && !name.is_empty()
    {
        out.push(Symbol {
            name: name.to_string(),
            kind: object
                .get("kind")
                .and_then(Value::as_u64)
                .and_then(|kind| u32::try_from(kind).ok())
                .unwrap_or(0),
            range: parse_range(range_value),
            depth,
        });
    }
    if let Some(children) = object.get("children").and_then(Value::as_array) {
        for child in children {
            collect_document_symbols(child, depth + 1, out);
        }
    }
}
