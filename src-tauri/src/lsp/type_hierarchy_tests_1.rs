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

/// Rebuild a `TypeHierarchyItem` from a node, for expanding a node the session never prepared.
pub fn type_hierarchy_item(node: &TypeHierarchyNode) -> Value {
    let range = json!({
        "start": { "line": node.line, "character": node.character },
        "end": { "line": node.line, "character": node.character },
    });
    json!({
        "name": node.name,
        "kind": node.kind,
        "uri": node.uri,
        "detail": node.detail,
        "range": range,
        "selectionRange": range,
    })
}
#[cfg(test)]
#[allow(dead_code)]
pub mod type_hierarchy_tests_group_1 {
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
    pub fn prepare_answer_becomes_nodes() {
        let answer = prepare_answer();
        let parsed = type_hierarchy_nodes(&answer);
        assert_eq!(parsed.len(), 1);

        let node = &parsed[0].0;
        assert_eq!(node.name, "Shape");
        assert_eq!(node.kind, 23);
        assert_eq!(node.uri, path_to_uri("/p/src/shape.rs"));
        assert_eq!(node.path, "/p/src/shape.rs");
        assert_eq!(node.line, 3);
        assert_eq!(node.character, 6, "selectionRange wins over range");
        assert!(node.detail.is_none());
        assert!(node.children.is_empty());
        assert!(node.parents.is_empty());

        assert_eq!(
            parsed[0].1["selectionRange"]["start"]["character"],
            json!(6),
            "the raw item is kept for the follow-up"
        );
    }

    #[test]
    pub fn null_prepare_answer_is_empty() {
        assert!(type_hierarchy_nodes(&Value::Null).is_empty());
        assert!(type_hierarchy_nodes(&json!(42)).is_empty());
        assert!(type_hierarchy_nodes(&json!([])).is_empty());
        assert!(type_hierarchy_nodes(&json!([{ "name": "NoUri", "kind": 23 }])).is_empty());
        assert!(type_hierarchy_nodes(&json!([{ "name": "", "uri": "file:///p/a.rs" }])).is_empty());
        assert!(
            type_hierarchy_nodes(&json!([{ "name": "Untitled", "uri": "untitled:Untitled-1" }]))
                .is_empty()
        );
    }

    #[test]
    pub fn follow_up_reads_the_parents_and_children_shape() {
        let answer = json!({
            "parents": [item("Base", "/p/src/base.rs", 0, 7)],
            "children": [item("Extra", "/p/src/extra.rs", 4, 7)],
        });

        let parents = hierarchy_items(&answer, &PARENT_KEYS);
        assert_eq!(parents.len(), 1);
        assert_eq!(parents[0].name, "Base");
        assert_eq!(parents[0].line, 0);
        assert_eq!(parents[0].character, 7);

        let children = hierarchy_items(&answer, &CHILD_KEYS);
        assert_eq!(children.len(), 1);
        assert_eq!(children[0].name, "Extra");
        assert_eq!(children[0].path, "/p/src/extra.rs");
    }

    #[test]
    pub fn follow_up_reads_the_array_shape() {
        let answer = json!([item("ShapeChild", "/p/src/child.rs", 1, 2)]);
        let children = hierarchy_items(&answer, &CHILD_KEYS);
        assert_eq!(children.len(), 1);
        assert_eq!(children[0].name, "ShapeChild");
        assert_eq!(children[0].line, 1);
        assert_eq!(children[0].character, 2);
        assert!(children[0].parents.is_empty());
    }

    #[test]
    pub fn follow_up_reads_the_item_envelope() {
        let mut shape = item("Shape", "/p/src/shape.rs", 3, 6);
        shape["supertypes"] = json!([item("Base", "/p/src/base.rs", 0, 7)]);
        let answer = json!({ "item": shape });

        let parents = hierarchy_items(&answer, &PARENT_KEYS);
        assert_eq!(parents.len(), 1);
        assert_eq!(parents[0].name, "Base");
        assert!(hierarchy_items(&answer, &CHILD_KEYS).is_empty());
    }

    #[test]
    pub fn a_null_direction_is_empty() {
        assert!(hierarchy_items(&Value::Null, &PARENT_KEYS).is_empty());
        assert!(hierarchy_items(&json!({ "parents": null }), &PARENT_KEYS).is_empty());
        assert!(hierarchy_items(&json!({}), &CHILD_KEYS).is_empty());
        assert!(hierarchy_items(&json!("nope"), &CHILD_KEYS).is_empty());
    }
}
