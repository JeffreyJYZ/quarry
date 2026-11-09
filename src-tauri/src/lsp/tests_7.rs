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
pub mod tests_group_7 {
    use super::*;

    #[test]
    fn a_start_reserves_an_idle_root() {
        let state = LspState::default();
        let root = "clangd::/tmp/quarry-lsp-claim";

        let claimed = tauri::async_runtime::block_on(claim_start(&state, root));

        assert!(claimed.is_none());
        assert!(lock(&state.in_flight).contains(root));
    }

    /// Two starts for one root: the first owns the reservation and registers the session, the second
    /// waits — yielding to the executor — and returns that same session instead of spawning a second
    /// server.
    #[test]
    fn a_waiting_start_returns_the_registered_session() {
        let state = Arc::new(LspState::default());
        let root = "rust-analyzer::/tmp/quarry-lsp-claim";

        // Stand in for the start that got there first: it holds the reservation, brings a session up
        // and registers it, which is what lets the waiter proceed.
        lock(&state.in_flight).insert(root.to_string());
        let first = Arc::clone(&state);
        let owner = thread::spawn(move || {
            thread::sleep(Duration::from_millis(30));
            let session = session_on_cat();
            lock(&first.sessions).insert(root.to_string(), Arc::clone(&session));
            lock(&first.in_flight).remove(root);
            session
        });

        let claimed = tauri::async_runtime::block_on(claim_start(&state, root));

        let registered = owner.join().expect("the first start finished");
        let claimed = claimed.expect("a waiter returns the session instead of reserving");
        assert!(Arc::ptr_eq(&claimed, &registered));
        assert_eq!(lock(&state.sessions).len(), 1);
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
}
