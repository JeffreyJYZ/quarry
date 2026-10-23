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

#[cfg(test)]
#[allow(dead_code)]
pub mod type_hierarchy_tests_group_2 {
    use super::*;

    /// Captured shape of a `textDocument/prepareTypeHierarchy` answer for one struct.
    pub fn prepare_answer() -> Value {
        json!([{
            "name": "Shape",
            "kind": 23,
            "uri": path_to_uri("/p/src/shape.rs"),
            "range": {
                "start": { "line": 3, "character": 0 },
                "end": { "line": 9, "character": 1 },
            },
            "selectionRange": {
                "start": { "line": 3, "character": 6 },
                "end": { "line": 3, "character": 11 },
            },
        }])
    }

    pub fn item(name: &str, path: &str, line: u32, character: u32) -> Value {
        json!({
            "name": name,
            "kind": 23,
            "uri": path_to_uri(path),
            "range": {
                "start": { "line": line, "character": 0 },
                "end": { "line": line + 2, "character": 1 },
            },
            "selectionRange": {
                "start": { "line": line, "character": character },
                "end": { "line": line, "character": character + 5 },
            },
        })
    }

    #[test]
    pub fn a_node_round_trips_as_a_request_item() {
        let node = type_hierarchy_nodes(&prepare_answer())
            .into_iter()
            .next()
            .expect("node")
            .0;

        let rebuilt = type_hierarchy_item(&node);
        assert_eq!(rebuilt["name"], json!("Shape"));
        assert_eq!(rebuilt["uri"], json!(path_to_uri("/p/src/shape.rs")));
        assert_eq!(
            rebuilt["selectionRange"]["start"],
            json!({ "line": 3, "character": 6 })
        );

        let again = type_hierarchy_node_from_item(&rebuilt).expect("node");
        assert_eq!(again, node);
    }

    #[test]
    pub fn a_raw_item_is_echoed_with_its_data() {
        let mut raw = item("Shape", "/p/src/shape.rs", 3, 6);
        raw["data"] = json!({ "usr": "c:@S@Shape" });
        let node = type_hierarchy_node_from_item(&raw).expect("node");

        assert!(raw.get("selectionRange").is_some());
        assert_eq!(type_hierarchy_key(&node), format!("{}|3:6|Shape", node.uri));
    }
}
