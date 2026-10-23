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
pub mod tests_group_6 {
    use super::*;

    #[test]
    pub fn signature_help_null_result_is_none() {
        assert!(parse_signature_help(&Value::Null).is_none());
    }

    #[test]
    pub fn signature_help_skips_malformed_entries() {
        let result = json!({
            "signatures": [
                { "documentation": "no label" },
                { "label": "ok()" },
                42,
            ],
        });
        let help = parse_signature_help(&result).expect("help");
        assert_eq!(help.signatures.len(), 1);
        assert_eq!(help.signatures[0].label, "ok()");
    }

    #[test]
    pub fn client_capabilities_advertise_the_navigation_requests() {
        let capabilities = client_capabilities();
        assert_eq!(
            capabilities["textDocument"]["hover"]["contentFormat"],
            json!(["markdown", "plaintext"])
        );
        assert_eq!(
            capabilities["textDocument"]["completion"]["completionItem"]["snippetSupport"],
            json!(false)
        );
        assert_eq!(
            capabilities["textDocument"]["definition"]["linkSupport"],
            json!(true)
        );
    }
}
