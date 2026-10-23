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
pub mod tests_group_3 {
    use super::*;

    #[test]
    pub fn diagnostics_event_maps_uri_to_an_absolute_path() {
        let path = "/tmp/project/src/main.rs";
        let params = json!({
            "uri": path_to_uri(path),
            "diagnostics": [{
                "range": { "start": { "line": 3, "character": 4 }, "end": { "line": 3, "character": 9 } },
                "message": "cannot find value",
                "severity": 1,
                "source": "rust-analyzer",
            }],
        });

        let event = diagnostics_event("/tmp/project", Some(&params)).expect("event");
        assert_eq!(event.path, path);
        assert_eq!(event.root, "/tmp/project");
        assert_eq!(event.diagnostics.len(), 1);

        let diagnostic = &event.diagnostics[0];
        assert_eq!(diagnostic.path, path);
        assert_eq!(diagnostic.range.start.line, 3);
        assert_eq!(diagnostic.range.end.character, 9);
        assert_eq!(diagnostic.severity, 1);
        assert_eq!(diagnostic.message, "cannot find value");
        assert_eq!(diagnostic.source.as_deref(), Some("rust-analyzer"));
    }

    #[test]
    pub fn hover_contents_flatten_every_shape() {
        assert_eq!(hover_contents(&json!("plain")), "plain");

        assert_eq!(
            hover_contents(&json!({ "kind": "markdown", "value": "**bold**" })),
            "**bold**"
        );

        assert_eq!(
            hover_contents(&json!({ "language": "rust", "value": "let x = 1;" })),
            "let x = 1;"
        );

        assert_eq!(
            hover_contents(&json!([
                { "language": "rust", "value": "let x = 1;" },
                "and a note",
            ])),
            "let x = 1;\n\nand a note"
        );
    }

    #[test]
    pub fn hover_answer_becomes_hover_info() {
        let result = json!({
            "contents": { "kind": "markdown", "value": "```rust\nlet x = 1;\n```" },
            "range": {
                "start": { "line": 2, "character": 4 },
                "end": { "line": 2, "character": 5 },
            },
        });

        let hover = parse_hover(&result).expect("hover");
        assert_eq!(hover.contents, "```rust\nlet x = 1;\n```");
        let range = hover.range.expect("range");
        assert_eq!(range.start.line, 2);
        assert_eq!(range.start.character, 4);
        assert_eq!(range.end.character, 5);

        assert!(parse_hover(&Value::Null).is_none());
    }

    #[test]
    pub fn definition_answer_maps_locations_and_links() {
        let single = json!({
            "uri": path_to_uri("/p/src/main.rs"),
            "range": {
                "start": { "line": 1, "character": 2 },
                "end": { "line": 1, "character": 8 },
            },
        });
        let locations = parse_locations(&single);
        assert_eq!(locations.len(), 1);
        assert_eq!(locations[0].path, "/p/src/main.rs");
        assert_eq!(locations[0].range.start.line, 1);
        assert_eq!(locations[0].range.end.character, 8);

        let list = json!([single.clone()]);
        assert_eq!(parse_locations(&list).len(), 1);

        let links = json!([{
            "targetUri": path_to_uri("/p/src/other.rs"),
            "targetRange": {
                "start": { "line": 3, "character": 0 },
                "end": { "line": 9, "character": 1 },
            },
            "targetSelectionRange": {
                "start": { "line": 3, "character": 4 },
                "end": { "line": 3, "character": 9 },
            },
        }]);
        let locations = parse_locations(&links);
        assert_eq!(locations.len(), 1);
        assert_eq!(locations[0].path, "/p/src/other.rs");
        assert_eq!(locations[0].range.start.character, 4);
        assert_eq!(locations[0].range.end.character, 9);
    }

    #[test]
    pub fn a_location_that_is_not_a_file_is_skipped() {
        let result = json!([
            { "uri": "untitled:Untitled-1", "range": { "start": { "line": 0, "character": 0 }, "end": { "line": 0, "character": 1 } } },
            { "uri": path_to_uri("/p/src/main.rs"), "range": { "start": { "line": 0, "character": 0 }, "end": { "line": 0, "character": 1 } } },
        ]);
        let locations = parse_locations(&result);
        assert_eq!(locations.len(), 1);
        assert_eq!(locations[0].path, "/p/src/main.rs");
    }
}
