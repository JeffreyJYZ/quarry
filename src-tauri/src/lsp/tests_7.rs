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

        // Stand in for the start that got there first: it holds the reservation and registers its
        // session only once the waiter below has proved it is already waiting, so the wait is an
        // observed fact instead of a race against an owner thread that might finish first.
        lock(&state.in_flight).insert(root.to_string());
        let (release, released) = std::sync::mpsc::channel::<()>();
        let owner_state = Arc::clone(&state);
        let owner = thread::spawn(move || {
            released
                .recv()
                .expect("the test releases the owner once the waiter is waiting");
            let session = session_on_cat();
            lock(&owner_state.sessions).insert(root.to_string(), Arc::clone(&session));
            lock(&owner_state.in_flight).remove(root);
            session
        });

        let (claims, claimed) = std::sync::mpsc::channel();
        let waiter_state = Arc::clone(&state);
        let waiter = thread::spawn(move || {
            let claim = tauri::async_runtime::block_on(claim_start(&waiter_state, root));
            let _ = claims.send(claim);
        });

        // Nothing has released the reservation yet, so a call that returned now reserved a second
        // session instead of waiting for this one. The bound is orders of magnitude above the
        // microseconds a return takes, so it measures the wait and not the machine's load.
        assert!(
            matches!(
                claimed.recv_timeout(Duration::from_secs(2)),
                Err(std::sync::mpsc::RecvTimeoutError::Timeout)
            ),
            "the waiter must wait for the reserved start instead of reserving a session of its own"
        );

        release.send(()).expect("the owner is waiting for it");
        let registered = owner.join().expect("the first start finished");
        let claimed = claimed
            .recv_timeout(Duration::from_secs(5))
            .expect("the waiter returns once the session is registered")
            .expect("a waiter returns the session instead of reserving");
        waiter.join().expect("the waiter finished");
        assert!(Arc::ptr_eq(&claimed, &registered));
        assert_eq!(lock(&state.sessions).len(), 1);
    }

    /// A dead entry must not be handed back: the server behind it has exited, so the caller reserves
    /// the root and spawns a fresh one.
    #[test]
    fn a_dead_session_is_dropped_instead_of_returned() {
        let state = LspState::default();
        let root = "rust-analyzer::/tmp/quarry-lsp-claim";
        let session = session_on_cat();
        // Exactly what the pump thread does when the server goes away.
        server_gone(&session);
        lock(&state.sessions).insert(root.to_string(), session);

        let claimed = tauri::async_runtime::block_on(claim_start(&state, root));

        assert!(claimed.is_none());
        assert!(lock(&state.in_flight).contains(root));
        assert!(!lock(&state.sessions).contains_key(root));
        assert_eq!(lock(&state.sessions).len(), 0);
    }

    /// A session over a real `cat`, which owns a pipe without being a language server.
    fn session_on_cat() -> Arc<Mutex<Session>> {
        let mut command = Command::new("cat");
        let pipe = ProcessPipe::spawn(&mut command).expect("starts cat");
        Arc::new(Mutex::new(Session {
            server: "cat".to_string(),
            database: None,
            profile: BuildProfile::default(),
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
