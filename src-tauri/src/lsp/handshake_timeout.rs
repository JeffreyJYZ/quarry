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

/// How long `initialize` may take before the session is declared dead.
pub const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(20);

/// How long to wait for a dead server's stderr to be drained into the failure message.
pub const STDERR_WAIT: Duration = Duration::from_millis(500);

/// How much of the server's stderr reaches the failure message.
pub const STDERR_MESSAGE_LIMIT: usize = 2000;

/// How long any other request may take before it is given up on.
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

/// Request ids this module sends. `initialize` and `shutdown` are the two fixed ones; document sync
/// is a notification, so they need no counter.
pub const INITIALIZE_ID: i64 = 1;

pub const SHUTDOWN_ID: i64 = 2;

/// First id handed out to a request that expects an answer. The counter starts clear of the two
/// fixed ids above, so a response can never be confused with the handshake.
pub const FIRST_REQUEST_ID: i64 = 100;

/// Held by Tauri as managed state; one entry per project root.
#[derive(Default)]
pub struct LspState {
    pub sessions: Mutex<HashMap<String, Arc<Mutex<Session>>>>,
}

/// A live server process plus the documents opened against it.
pub struct Session {
    pub(crate) server: String,
    pub(crate) pipe: ProcessPipe,
    /// Open document path to the version last sent, so `didChange` speaks the same version the
    /// server last heard.
    pub(crate) documents: HashMap<String, u32>,
    /// Recorded end position of each open document, computed from the text last sent.
    pub(crate) document_ends: HashMap<String, Position>,
    /// The next request id to hand out. Monotonic, so a late answer can never be mistaken for a
    /// newer request's answer.
    pub(crate) next_request_id: i64,
    /// Requests that are waiting for an answer, keyed by the id they were sent with.
    pub(crate) pending: HashMap<i64, Pending>,
    /// Monotonic id for stored call-hierarchy items.
    pub(crate) next_call_hierarchy_id: u32,
    /// Raw `CallHierarchyItem` JSON keyed by the id handed out to the UI.
    pub(crate) call_hierarchy_items: HashMap<u32, Value>,
    /// Raw `TypeHierarchyItem` JSON keyed by [`type_hierarchy_key`], so a follow-up hands the server
    /// back the item it sent, `data` included.
    pub(crate) type_hierarchy_items: HashMap<String, Value>,
}

/// One request that is waiting for its answer.
pub struct Pending {
    /// The method that was asked for, so an error can name it.
    pub(crate) method: String,
    /// The channel the answer travels on. Dropping the session drops this, which tells the
    /// waiting side that no answer is coming.
    pub(crate) sender: oneshot::Sender<Result<Value, String>>,
}

impl Session {
    /// Send one request and hand back its id and the channel its answer will arrive on.
    ///
    /// The pending entry is registered before the frame goes out, so a fast server cannot answer
    /// before there is somewhere to put the answer.
    pub(crate) fn begin_request(
        &mut self,
        method: &str,
        params: Value,
    ) -> Result<(i64, oneshot::Receiver<Result<Value, String>>), String> {
        let id = self.next_request_id;
        self.next_request_id += 1;
        let (sender, receiver) = oneshot::channel();
        self.pending.insert(
            id,
            Pending {
                method: method.to_string(),
                sender,
            },
        );

        let message = request(id, method, params);
        if let Err(error) = self.pipe.send(&message) {
            self.pending.remove(&id);
            return Err(format!("{}: cannot send {method}: {error}", self.server));
        }

        Ok((id, receiver))
    }
}

impl Session {
    /// Say goodbye and kill the child. Safe to call twice: a killed child rejects further frames,
    /// and those errors are deliberately ignored here.
    pub(crate) fn stop(&mut self) {
        self.call_hierarchy_items.clear();
        self.type_hierarchy_items.clear();
        self.documents.clear();
        self.document_ends.clear();
        let _ = self
            .pipe
            .send(&request(SHUTDOWN_ID, "shutdown", Value::Null));
        let _ = self.pipe.send(&notification("exit", Value::Null));
        let _ = self.pipe.kill();
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        // `ProcessPipe`'s own `Drop` kills and reaps; this only gives the server a chance to shut
        // down cleanly when the session goes away without `stop_lsp` (app exit, thread failure).
        let _ = self
            .pipe
            .send(&request(SHUTDOWN_ID, "shutdown", Value::Null));
        let _ = self.pipe.send(&notification("exit", Value::Null));
    }
}
