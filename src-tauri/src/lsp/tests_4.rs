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
pub mod tests_group_4 {
    use super::*;

    #[test]
    pub fn completion_answer_reads_both_shapes() {
        let list = json!({
            "isIncomplete": true,
            "items": [
                { "label": "print", "detail": "fn()", "kind": 3, "insertText": "print!()" },
                { "label": "println" },
            ],
        });
        let completion = parse_completion(&list);
        assert!(completion.is_incomplete);
        assert_eq!(completion.items.len(), 2);
        assert_eq!(completion.items[0].label, "print");
        assert_eq!(completion.items[0].detail.as_deref(), Some("fn()"));
        assert_eq!(completion.items[0].kind, Some(3));
        assert_eq!(completion.items[0].insert_text.as_deref(), Some("print!()"));
        assert_eq!(completion.items[1].insert_text.as_deref(), Some("println"));

        let bare = json!([{ "label": "vec" }]);
        let completion = parse_completion(&bare);
        assert!(!completion.is_incomplete);
        assert_eq!(completion.items.len(), 1);
        assert_eq!(completion.items[0].label, "vec");
    }

    #[test]
    pub fn reference_params_ask_for_the_declaration() {
        let params = references_params("file:///p/src/main.rs", 7, 3);
        assert_eq!(
            params["textDocument"]["uri"],
            json!("file:///p/src/main.rs")
        );
        assert_eq!(params["position"], json!({ "line": 7, "character": 3 }));
        assert_eq!(params["context"], json!({ "includeDeclaration": true }));
    }

    #[test]
    pub fn a_malformed_answer_reads_as_empty() {
        assert!(parse_locations(&json!("not a location")).is_empty());
        assert!(parse_locations(&json!({ "uri": 7 })).is_empty());
        assert!(
            parse_completion(&json!({ "items": "nope" }))
                .items
                .is_empty()
        );
        assert!(parse_completion(&json!(42)).items.is_empty());
        assert!(parse_hover(&json!({ "contents": 7 })).is_none());
    }

    #[test]
    pub fn start_failure_composes_one_actionable_line() {
        let message = format_start_failure(
            "rust-analyzer",
            "stopped before answering initialize: protocol: unexpected end of stream before frame header",
            "info: `rust-analyzer` is unavailable for the active toolchain\ninfo: falling back to \"/opt/homebrew/opt/rustup/bin/rust-analyzer\"\n",
        );
        assert!(message.contains("rust-analyzer could not start"));
        assert!(message.contains("server said:"));
        assert!(message.contains("is unavailable for the active toolchain"));
        assert!(message.contains("rustup component add rust-analyzer"));
        assert!(!message.contains('\n'));
    }

    #[test]
    pub fn stderr_truncation_marks_the_cut() {
        let input = "a".repeat(100);
        let output = truncate_stderr(&input, 10);
        assert_eq!(output.chars().count(), 10 + "… (truncated)".chars().count());
        assert!(output.ends_with("… (truncated)"));
        assert_eq!(truncate_stderr(&input, 200), input);
    }

    #[test]
    pub fn document_symbols_flatten_two_levels() {
        let result = json!([
            {
                "name": "Outer",
                "kind": 5,
                "range": { "start": { "line": 0, "character": 0 }, "end": { "line": 10, "character": 1 } },
                "children": [
                    {
                        "name": "Inner",
                        "kind": 12,
                        "range": { "start": { "line": 2, "character": 4 }, "end": { "line": 2, "character": 9 } }
                    }
                ]
            }
        ]);
        let symbols = parse_symbols(&result);
        assert_eq!(symbols.len(), 2);
        assert_eq!(symbols[0].name, "Outer");
        assert_eq!(symbols[0].depth, 0);
        assert_eq!(symbols[1].name, "Inner");
        assert_eq!(symbols[1].depth, 1);
    }

    #[test]
    pub fn symbol_information_maps_absolute_range_at_depth_zero() {
        let result = json!([
            {
                "name": "foo",
                "kind": 12,
                "location": {
                    "uri": path_to_uri("/p/src/main.rs"),
                    "range": { "start": { "line": 3, "character": 4 }, "end": { "line": 3, "character": 7 } }
                }
            }
        ]);
        let symbols = parse_symbols(&result);
        assert_eq!(symbols.len(), 1);
        assert_eq!(symbols[0].name, "foo");
        assert_eq!(symbols[0].depth, 0);
        assert_eq!(symbols[0].range.start.line, 3);
        assert_eq!(symbols[0].range.start.character, 4);
    }
}
