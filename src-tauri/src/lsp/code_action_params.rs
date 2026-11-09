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

/// The `textDocument/codeAction` params for a caret at `line`/`character`.
///
/// `diagnostics` is the caller's own list for that range, in the wire shape the protocol expects:
/// clangd and rust-analyzer only offer a diagnostic-bound quick fix when the diagnostic it belongs
/// to is in this context, so an empty list asks for source and refactor actions alone. A caller
/// with nothing to send passes an empty slice, which is a valid request, never a missing field.
pub fn code_action_params(path: &str, line: u32, character: u32, diagnostics: &[Value]) -> Value {
    json!({
        "textDocument": { "uri": path_to_uri(path) },
        "range": {
            "start": { "line": line, "character": character },
            "end": { "line": line, "character": character },
        },
        "context": { "diagnostics": diagnostics },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn finding() -> Value {
        json!({
            "range": {
                "start": { "line": 4, "character": 8 },
                "end": { "line": 4, "character": 9 },
            },
            "severity": 1,
            "message": "no member named 'x'",
            "source": "clangd",
        })
    }

    #[test]
    fn params_carry_the_diagnostics_the_caller_passed() {
        let params = code_action_params("/p/src/main.cpp", 4, 8, &[finding()]);
        assert_eq!(params["context"]["diagnostics"], json!([finding()]));
        assert_eq!(
            params["range"]["start"],
            json!({ "line": 4, "character": 8 })
        );
        assert_eq!(params["range"]["end"], json!({ "line": 4, "character": 8 }));
    }

    #[test]
    fn no_diagnostics_is_an_empty_list_not_an_absent_field() {
        let params = code_action_params("/p/src/main.rs", 0, 0, &[]);
        assert_eq!(params["context"]["diagnostics"], json!([]));
    }
}
