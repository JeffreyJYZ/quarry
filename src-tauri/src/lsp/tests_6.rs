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
    pub fn server_gone_marks_the_session_dead_and_releases_waiters() {
        let session = session_on_cat();
        let mut receiver = {
            let mut guard = lock(&session);
            let (_, receiver) = guard
                .begin_request("textDocument/hover", Value::Null)
                .expect("the request is registered before it is sent");
            assert_eq!(guard.pending.len(), 1);
            receiver
        };

        server_gone(&session);

        assert!(lock(&session).dead);
        assert!(lock(&session).pending.is_empty());
        // A dropped sender, not a timeout, is how a waiter learns no answer is coming.
        assert!(matches!(
            receiver.try_recv(),
            Err(oneshot::error::TryRecvError::Closed)
        ));
    }

    /// A session over a real `cat`, which owns a pipe without being a language server.
    fn session_on_cat() -> Arc<Mutex<Session>> {
        let mut command = Command::new("cat");
        let pipe = ProcessPipe::spawn(&mut command).expect("starts cat");
        Arc::new(Mutex::new(Session {
            server: "cat".to_string(),
            pipe,
            documents: HashMap::new(),
            document_ends: HashMap::new(),
            document_texts: HashMap::new(),
            next_request_id: FIRST_REQUEST_ID,
            pending: HashMap::new(),
            next_call_hierarchy_id: 1,
            call_hierarchy_items: HashMap::new(),
            type_hierarchy_items: HashMap::new(),
            dead: false,
            semantic_types: Vec::new(),
            semantic_modifiers: Vec::new(),
        }))
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
