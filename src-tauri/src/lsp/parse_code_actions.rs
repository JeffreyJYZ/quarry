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

/// Read code actions out of a `textDocument/codeAction` answer.
///
/// Only actions carrying an `edit` (a `WorkspaceEdit`) are kept; actions that
/// carry only a `command` are dropped. `isPreferred` is ignored.
pub fn parse_code_actions(result: &Value) -> Vec<CodeAction> {
    let mut out = Vec::new();
    let Some(entries) = result.as_array() else {
        return out;
    };
    for entry in entries {
        let Some(edit) = entry.get("edit") else {
            continue;
        };
        let title = entry
            .get("title")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let kind = entry
            .get("kind")
            .and_then(Value::as_str)
            .map(str::to_string);
        out.push(CodeAction {
            title,
            kind,
            edits: parse_workspace_edit(edit),
        });
    }
    out
}

#[cfg(test)]
pub mod rename_extra_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rename_changes_shape() {
        let v = json!({
            "changes": {
                path_to_uri("/p/src/main.rs"): [
                    { "range": { "start": {"line":0,"character":0}, "end": {"line":0,"character":1} }, "newText": "x" }
                ]
            }
        });
        let out = parse_workspace_edit(&v);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].path, "/p/src/main.rs");
    }

    #[test]
    fn rename_document_changes_shape() {
        let v = json!({
            "documentChanges": [
                { "textDocument": { "uri": path_to_uri("/p/src/other.rs") }, "edits": [
                    { "range": { "start": {"line":1,"character":2}, "end": {"line":1,"character":3} }, "newText": "y" }
                ] }
            ]
        });
        let out = parse_workspace_edit(&v);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].path, "/p/src/other.rs");
    }

    #[test]
    fn rename_null_empty() {
        assert!(parse_workspace_edit(&Value::Null).is_empty());
    }

    #[test]
    fn code_action_keeps_edit_drops_command() {
        let v = json!([
            { "title": "fix", "kind": "quickfix", "edit": { "changes": {} } },
            { "title": "cmd", "command": { "title": "x", "command": "y" } }
        ]);
        let out = parse_code_actions(&v);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].title, "fix");
    }

    #[test]
    fn non_file_uri_skipped() {
        let v = json!({
            "changes": {
                "untitled:Untitled-1": [
                    { "range": { "start": {"line":0,"character":0}, "end": {"line":0,"character":1} }, "newText": "x" }
                ]
            }
        });
        assert!(parse_workspace_edit(&v).is_empty());
    }

    #[test]
    fn malformed_edit_ignored() {
        let v = json!({
            "changes": {
                path_to_uri("/p/src/main.rs"): [
                    { "range": { "start": {"line":0,"character":0} }, "newText": 5 },
                    { "range": { "start": {"line":0,"character":0}, "end": {"line":0,"character":1} }, "newText": "ok" }
                ]
            }
        });
        let out = parse_workspace_edit(&v);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].edits.len(), 1);
    }
}
