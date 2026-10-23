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
pub mod tests_group_5 {
    use super::*;

    #[test]
    pub fn symbol_without_range_is_skipped() {
        let result = json!([
            { "name": "no_range", "kind": 1 },
            {
                "name": "has_range",
                "kind": 2,
                "range": { "start": { "line": 1, "character": 2 }, "end": { "line": 1, "character": 6 } }
            }
        ]);
        let symbols = parse_symbols(&result);
        assert_eq!(symbols.len(), 1);
        assert_eq!(symbols[0].name, "has_range");
    }

    #[test]
    pub fn document_end_single_line() {
        assert_eq!(
            document_end("hello"),
            Position {
                line: 0,
                character: 5
            }
        );
    }

    #[test]
    pub fn document_end_trailing_newline() {
        assert_eq!(
            document_end("hello\n"),
            Position {
                line: 1,
                character: 0
            }
        );
    }

    #[test]
    pub fn document_end_multi_line() {
        assert_eq!(
            document_end("a\nbc"),
            Position {
                line: 1,
                character: 2
            }
        );
    }

    #[test]
    pub fn document_end_empty() {
        assert_eq!(
            document_end(""),
            Position {
                line: 0,
                character: 0
            }
        );
    }

    #[test]
    pub fn document_end_utf16() {
        // '😀' is one code point but two UTF-16 code units.
        assert_eq!(
            document_end("a😀"),
            Position {
                line: 0,
                character: 3
            }
        );
    }

    #[test]
    pub fn null_symbols_result_is_empty() {
        assert!(parse_symbols(&Value::Null).is_empty());
    }

    #[test]
    pub fn signature_help_parses_two_signatures_with_indices() {
        let result = json!({
            "signatures": [
                { "label": "foo(a: i32)", "documentation": "first" },
                { "label": "foo(a: i32, b: i32)", "documentation": { "kind": "markdown", "value": "second" } },
            ],
            "activeSignature": 1,
            "activeParameter": 0,
        });
        let help = parse_signature_help(&result).expect("help");
        assert_eq!(help.signatures.len(), 2);
        assert_eq!(help.signatures[0].label, "foo(a: i32)");
        assert_eq!(help.signatures[0].documentation.as_deref(), Some("first"));
        assert_eq!(help.signatures[1].documentation.as_deref(), Some("second"));
        assert_eq!(help.active_signature, 1);
        assert_eq!(help.active_parameter, 0);
    }

    #[test]
    pub fn signature_help_defaults_indices_when_missing() {
        let result = json!({
            "signatures": [{ "label": "bar()" }],
        });
        let help = parse_signature_help(&result).expect("help");
        assert_eq!(help.signatures.len(), 1);
        assert_eq!(help.active_signature, 0);
        assert_eq!(help.active_parameter, 0);
    }

    #[test]
    pub fn signature_help_flattens_documentation_object() {
        let result = json!({
            "signatures": [{ "label": "baz()", "documentation": { "language": "rust", "value": "let x = 1;" } }],
        });
        let help = parse_signature_help(&result).expect("help");
        assert_eq!(
            help.signatures[0].documentation.as_deref(),
            Some("let x = 1;")
        );
    }
}
