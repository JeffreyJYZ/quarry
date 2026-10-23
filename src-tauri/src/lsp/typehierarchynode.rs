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

// Aliases removed: keep one parser name per shape.

/// One node of a type hierarchy.
///
/// Both type-hierarchy commands answer with this shape, so the UI renders either direction from one
/// model: `prepare` returns nodes with empty `parents` and `children`, and the follow-up fills them.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TypeHierarchyNode {
    pub name: String,
    /// LSP `SymbolKind`.
    pub kind: u32,
    /// The server's own URI, kept verbatim so a follow-up hands back what the server sent.
    pub uri: String,
    pub path: String,
    pub line: u32,
    pub character: u32,
    pub detail: Option<String>,
    pub children: Vec<TypeHierarchyNode>,
    pub parents: Vec<TypeHierarchyNode>,
}

/// The follow-up answer: the item that was asked about, with the neighbours the server reported.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct TypeHierarchyAnswer {
    pub item: TypeHierarchyNode,
}

/// Keys a follow-up answer may name the parents under, in the order they are looked for.
pub const PARENT_KEYS: [&str; 2] = ["parents", "supertypes"];

/// Keys a follow-up answer may name the children under, in the order they are looked for.
pub const CHILD_KEYS: [&str; 2] = ["children", "subtypes"];

/// `textDocument/prepareTypeHierarchy`: the types at one position, as hierarchy roots.
///
/// `project_root` and `root` are the same argument: the frontend may pass either key, because every
/// other LSP command here takes `root` while this unit was specified as `project_root`.
///
/// A `null` answer — a server without type hierarchy — reads as an empty list, because "not
/// supported" carries nothing for the user to act on.
#[tauri::command]
pub async fn lsp_prepare_type_hierarchy(
    state: State<'_, LspState>,
    root: Option<String>,
    project_root: Option<String>,
    path: String,
    line: u32,
    character: u32,
) -> Result<Vec<TypeHierarchyNode>, String> {
    let root = project_root
        .or(root)
        .ok_or_else(|| "no project root given".to_string())?;
    let session = session_for(&state, &root)?;
    let result = send_request(
        &session,
        "textDocument/prepareTypeHierarchy",
        position_params(&path_to_uri(&path), line, character),
    )
    .await?;

    let parsed = type_hierarchy_nodes(&result);
    let mut guard = lock(&session);
    for (node, raw) in &parsed {
        guard
            .type_hierarchy_items
            .insert(type_hierarchy_key(node), (*raw).clone());
    }
    Ok(parsed.into_iter().map(|(node, _)| node).collect())
}
