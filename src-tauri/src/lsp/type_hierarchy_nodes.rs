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

/// `typeHierarchy/supertypes` and `typeHierarchy/subtypes` for one prepared item.
///
/// `item` is what the UI holds: a [`TypeHierarchyNode`] this module returned, or the raw
/// `TypeHierarchyItem` a server sent, optionally inside the `{ item }` answer envelope. A raw item is
/// echoed back untouched, so a server that keeps state in `data` still recognises it (clangd stores a
/// USR there); a node is resolved through the session's raw-item cache and, failing that, rebuilt.
///
/// A `null` direction reads as an empty `parents` or `children` list, never as an error.
#[tauri::command]
pub async fn lsp_type_hierarchy(
    state: State<'_, LspState>,
    root: Option<String>,
    project_root: Option<String>,
    item: Value,
) -> Result<TypeHierarchyAnswer, String> {
    let root = project_root
        .or(root)
        .ok_or_else(|| "no project root given".to_string())?;
    let session = session_for(&state, &root)?;

    let handed_back = item.get("item").unwrap_or(&item);
    let mut base = type_hierarchy_node_from_item(handed_back)
        .ok_or_else(|| format!("not a type hierarchy item: {handed_back}"))?;

    let request_item = if handed_back.get("selectionRange").is_some() {
        handed_back.clone()
    } else {
        lock(&session)
            .type_hierarchy_items
            .get(&type_hierarchy_key(&base))
            .cloned()
            .unwrap_or_else(|| type_hierarchy_item(&base))
    };

    let parents = send_request(
        &session,
        "typeHierarchy/supertypes",
        json!({ "item": &request_item }),
    )
    .await?;
    let children = send_request(
        &session,
        "typeHierarchy/subtypes",
        json!({ "item": &request_item }),
    )
    .await?;

    base.parents = hierarchy_items(&parents, &PARENT_KEYS);
    base.children = hierarchy_items(&children, &CHILD_KEYS);

    Ok(TypeHierarchyAnswer { item: base })
}
/// The nodes a `prepareTypeHierarchy` answer carries, each paired with the raw item it came from.
///
/// The answer may be an item list or a single item; `null` and anything unparseable read as empty.
pub fn type_hierarchy_nodes(result: &Value) -> Vec<(TypeHierarchyNode, &Value)> {
    let entries: Vec<&Value> = match result {
        Value::Array(items) => items.iter().collect(),
        Value::Object(_) => vec![result],
        _ => Vec::new(),
    };

    entries
        .into_iter()
        .map(|entry| entry.get("item").unwrap_or(entry))
        .filter_map(|item| type_hierarchy_node_from_item(item).map(|node| (node, item)))
        .collect()
}

/// Read one `TypeHierarchyItem` — or the node this module returned for it — into the UI shape.
///
/// The caret sits at `selectionRange.start`, falling back to `range.start`, then to a node's own
/// `line` and `character`. An item that does not point at a file is dropped: nothing can be opened.
pub fn type_hierarchy_node_from_item(item: &Value) -> Option<TypeHierarchyNode> {
    let name = item.get("name").and_then(Value::as_str)?;
    if name.is_empty() {
        return None;
    }
    let uri = item.get("uri").and_then(Value::as_str)?;
    let path = uri_to_path(uri)?;
    if !path.starts_with('/') {
        return None;
    }
    let start = item
        .get("selectionRange")
        .or_else(|| item.get("range"))
        .map(parse_range)
        .map(|range| range.start)
        .unwrap_or_else(|| position(Some(item)));

    Some(TypeHierarchyNode {
        name: name.to_string(),
        kind: item
            .get("kind")
            .and_then(Value::as_u64)
            .and_then(|kind| u32::try_from(kind).ok())
            .unwrap_or(0),
        uri: uri.to_string(),
        path,
        line: start.line,
        character: start.character,
        detail: item
            .get("detail")
            .and_then(Value::as_str)
            .filter(|detail| !detail.is_empty())
            .map(str::to_string),
        children: Vec::new(),
        parents: Vec::new(),
    })
}

/// The nodes one direction's answer carries.
///
/// The answer is the item list itself, or an object naming it under `keys`, possibly inside an
/// `item` key. A missing direction and a `null` direction are both empty.
pub fn hierarchy_items(answer: &Value, keys: &[&str]) -> Vec<TypeHierarchyNode> {
    let Some(entries) = hierarchy_entry_list(answer, keys) else {
        return Vec::new();
    };

    entries
        .iter()
        .map(|entry| entry.get("item").unwrap_or(entry))
        .filter_map(type_hierarchy_node_from_item)
        .collect()
}

pub fn hierarchy_entry_list<'a>(answer: &'a Value, keys: &[&str]) -> Option<&'a Vec<Value>> {
    if let Some(entries) = answer.as_array() {
        return Some(entries);
    }
    if let Some(inner) = answer.get("item")
        && let Some(entries) = named_list(inner, keys)
    {
        return Some(entries);
    }
    named_list(answer, keys)
}

pub fn named_list<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Vec<Value>> {
    let object = value.as_object()?;
    keys.iter()
        .find_map(|key| object.get(*key).and_then(Value::as_array))
}

/// Identity of one node inside a session: the server's URI plus the caret position and the name.
///
/// The raw item is filed under this key, so a follow-up hands the server back exactly what it sent,
/// `data` included.
pub fn type_hierarchy_key(node: &TypeHierarchyNode) -> String {
    format!(
        "{}|{}:{}|{}",
        node.uri, node.line, node.character, node.name
    )
}
