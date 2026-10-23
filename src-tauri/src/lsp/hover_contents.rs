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

/// Ask the server one question and wait for the answer.
///
/// The session lock is held only for the write; the wait happens with no lock held, so the pump
/// thread is free to answer while this call is still waiting.
pub async fn send_request(
    session: &Arc<Mutex<Session>>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let (id, receiver) = {
        let mut guard = lock(session);
        guard.begin_request(method, params)?
    };

    match tokio::time::timeout(REQUEST_TIMEOUT, receiver).await {
        Ok(Ok(outcome)) => outcome,
        Ok(Err(_)) => Err(format!(
            "{method}: the language server closed the connection"
        )),
        Err(_) => {
            lock(session).pending.remove(&id);
            Err(format!(
                "{method} did not answer within {}s",
                REQUEST_TIMEOUT.as_secs()
            ))
        }
    }
}
/// Flatten a hover's contents into one string.
///
/// The server may answer with a plain string, a `MarkupContent` object, a `MarkedString` object or
/// an array of those. Every block keeps its own text; blocks are joined by a blank line.
pub fn hover_contents(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Object(_) => value
            .get("value")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        Value::Array(blocks) => blocks
            .iter()
            .map(hover_contents)
            .collect::<Vec<_>>()
            .join("\n\n"),
        _ => String::new(),
    }
}

/// Read a hover out of the server's answer; `None` when there is nothing to show.
pub fn parse_hover(result: &Value) -> Option<HoverInfo> {
    if result.is_null() {
        return None;
    }
    let contents = result.get("contents")?;
    let text = hover_contents(contents);
    if text.is_empty() {
        return None;
    }
    Some(HoverInfo {
        contents: text,
        range: result.get("range").map(parse_range),
    })
}

/// Read a range out of the server's answer; a missing or broken range reads as the origin.
pub fn parse_range(value: &Value) -> Range {
    Range {
        start: position(value.get("start")),
        end: position(value.get("end")),
    }
}

/// Read the locations out of a definition or references answer.
///
/// The answer may be a single `Location`, a list of them, or a list of `LocationLink`s. A link
/// carries the identifier's own range in `targetSelectionRange`; the whole target in
/// `targetRange`. The identifier's range wins, because that is where the caret belongs.
pub fn parse_locations(result: &Value) -> Vec<Location> {
    match result {
        Value::Array(entries) => entries.iter().filter_map(parse_location).collect(),
        Value::Object(_) => parse_location(result).into_iter().collect(),
        _ => Vec::new(),
    }
}

pub fn parse_location(value: &Value) -> Option<Location> {
    let uri = value
        .get("uri")
        .and_then(Value::as_str)
        .or_else(|| value.get("targetUri").and_then(Value::as_str))?;
    let path = uri_to_path(uri)?;
    if !path.starts_with('/') {
        return None;
    }
    let range = value
        .get("range")
        .or_else(|| value.get("targetSelectionRange"))
        .or_else(|| value.get("targetRange"))
        .map(parse_range)
        .unwrap_or_else(|| Range {
            start: Position {
                line: 0,
                character: 0,
            },
            end: Position {
                line: 0,
                character: 0,
            },
        });
    Some(Location { path, range })
}
