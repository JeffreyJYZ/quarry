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

/// Compose the one line the user sees when a server will not start.
///
/// The protocol error alone only says the connection died; the server's own stderr is where the
/// reason lives, so it is folded into the message on a single line.
pub fn format_start_failure(server: &str, reason: &str, stderr: &str) -> String {
    let mut line = format!("{server} could not start: {reason}");
    let detail = one_line(&truncate_stderr(stderr, STDERR_MESSAGE_LIMIT));
    if !detail.is_empty() {
        line.push_str(" — server said: ");
        line.push_str(&detail);
        if let Some(fix) = start_hint(server, &detail) {
            line.push_str(&format!(" (fix: {fix})"));
        }
    }
    line
}

/// What the user can do about a start that failed, when the server named the reason itself.
pub fn start_hint(server: &str, stderr: &str) -> Option<String> {
    if server == "rust-analyzer" && stderr.contains("is unavailable for the active toolchain") {
        return Some(format!("run `rustup component add {server}`"));
    }
    None
}

/// Trim a string to at most `limit` characters, cutting on a character boundary.
pub fn truncate_stderr(text: &str, limit: usize) -> String {
    if text.chars().count() <= limit {
        return text.to_string();
    }
    let mut end = limit;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}… (truncated)", &text[..end])
}

/// Collapse any run of whitespace into a single space so the failure message stays one line.
pub fn one_line(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Client capabilities this IDE advertises. Only what the navigation requests need is declared;
/// everything else keeps the specification's default.
pub fn client_capabilities() -> Value {
    json!({
        "textDocument": {
            "hover": { "contentFormat": ["markdown", "plaintext"] },
            "completion": { "completionItem": { "snippetSupport": false } },
            "definition": { "linkSupport": true }
        }
    })
}

/// The `textDocument` + `position` pair every navigation request shares.
pub fn position_params(uri: &str, line: u32, character: u32) -> Value {
    json!({
        "textDocument": { "uri": uri },
        "position": { "line": line, "character": character },
    })
}

/// `textDocument/references` asks for the declaration too.
pub fn references_params(uri: &str, line: u32, character: u32) -> Value {
    json!({
        "textDocument": { "uri": uri },
        "position": { "line": line, "character": character },
        "context": { "includeDeclaration": true },
    })
}

/// `textDocument/completion` was triggered by typing, not by an explicit invocation.
pub fn completion_params(uri: &str, line: u32, character: u32) -> Value {
    json!({
        "textDocument": { "uri": uri },
        "position": { "line": line, "character": character },
        "context": { "triggerKind": 1 },
    })
}
