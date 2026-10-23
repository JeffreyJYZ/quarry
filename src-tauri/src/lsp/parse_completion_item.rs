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

/// Read the items out of a completion answer.
///
/// The answer may be a `CompletionList` or a bare array of items. An item without a label is
/// dropped: there is nothing to show for it.
pub fn parse_completion(result: &Value) -> CompletionList {
    let (items, is_incomplete) = match result {
        Value::Array(items) => (items.clone(), false),
        Value::Object(_) => (
            result
                .get("items")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default(),
            result
                .get("isIncomplete")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        ),
        _ => (Vec::new(), false),
    };

    CompletionList {
        items: items.iter().filter_map(parse_completion_item).collect(),
        is_incomplete,
    }
}
pub fn parse_completion_item(value: &Value) -> Option<CompletionItem> {
    let label = value.get("label").and_then(Value::as_str)?.to_string();
    let insert_text = value
        .get("insertText")
        .and_then(Value::as_str)
        .unwrap_or(&label)
        .to_string();
    Some(CompletionItem {
        label,
        detail: value
            .get("detail")
            .and_then(Value::as_str)
            .map(str::to_string),
        kind: value
            .get("kind")
            .and_then(Value::as_u64)
            .and_then(|kind| u32::try_from(kind).ok()),
        insert_text: Some(insert_text),
    })
}

/// Zero-based position inside a document.
#[tauri::command]
pub async fn lsp_hover(
    state: State<'_, LspState>,
    root: String,
    path: String,
    line: u32,
    character: u32,
) -> Result<Option<HoverInfo>, String> {
    let session = session_for(&state, &root)?;
    let result = send_request(
        &session,
        "textDocument/hover",
        position_params(&path_to_uri(&path), line, character),
    )
    .await?;
    Ok(parse_hover(&result))
}

#[tauri::command]
pub async fn lsp_definition(
    state: State<'_, LspState>,
    root: String,
    path: String,
    line: u32,
    character: u32,
) -> Result<Vec<Location>, String> {
    let session = session_for(&state, &root)?;
    let result = send_request(
        &session,
        "textDocument/definition",
        position_params(&path_to_uri(&path), line, character),
    )
    .await?;
    Ok(parse_locations(&result))
}

#[tauri::command]
pub async fn lsp_references(
    state: State<'_, LspState>,
    root: String,
    path: String,
    line: u32,
    character: u32,
) -> Result<Vec<Location>, String> {
    let session = session_for(&state, &root)?;
    let result = send_request(
        &session,
        "textDocument/references",
        references_params(&path_to_uri(&path), line, character),
    )
    .await?;
    Ok(parse_locations(&result))
}

#[tauri::command]
pub async fn lsp_completion(
    state: State<'_, LspState>,
    root: String,
    path: String,
    line: u32,
    character: u32,
) -> Result<CompletionList, String> {
    let session = session_for(&state, &root)?;
    let result = send_request(
        &session,
        "textDocument/completion",
        completion_params(&path_to_uri(&path), line, character),
    )
    .await?;
    Ok(parse_completion(&result))
}

/// Flattened document outline: nested symbols arrive with `children`, the UI gets a depth.
#[tauri::command]
pub async fn lsp_symbols(
    state: State<'_, LspState>,
    root: String,
    path: String,
) -> Result<Vec<Symbol>, String> {
    let session = session_for(&state, &root)?;
    let result = send_request(
        &session,
        "textDocument/documentSymbol",
        json!({ "textDocument": { "uri": path_to_uri(&path) } }),
    )
    .await?;
    Ok(parse_symbols(&result))
}
