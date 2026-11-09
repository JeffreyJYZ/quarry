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

#[tauri::command]
pub async fn start_lsp(
    app: AppHandle,
    state: State<'_, LspState>,
    root: String,
    // Absolute path to the server binary; empty means "find it yourself".
    server_path: Option<String>,
    // Extra arguments, already split by the caller.
    server_args: Option<Vec<String>>,
) -> Result<LspStatus, String> {
    let overrides = StartOverrides {
        path: server_path.unwrap_or_default(),
        args: server_args.unwrap_or_default(),
    };
    match start_lsp_session(app, state.inner(), &root, &overrides).await {
        Ok(status) => {
            lock(&state.in_flight).remove(&root);
            Ok(status)
        }
        Err(error) => {
            // A failed start must leave nothing behind: a half-registered session would make
            // later document syncs talk to a server that is not there.
            lock(&state.sessions).remove(&root);
            lock(&state.in_flight).remove(&root);
            Err(error)
        }
    }
}

/// What the settings page may override when a server is started.
#[derive(Clone, Debug, Default)]
pub struct StartOverrides {
    /// Absolute path to the binary; empty means resolve it from `PATH`, the toolchain directories or
    /// `xcrun`.
    pub(crate) path: String,
    /// Extra arguments handed to the server as its own arguments.
    pub(crate) args: Vec<String>,
}

pub async fn start_lsp_session(
    app: AppHandle,
    state: &LspState,
    root: &str,
    overrides: &StartOverrides,
) -> Result<LspStatus, String> {
    let root = root.to_string();
    // Atomic check-and-reserve: a concurrent start for the same root waits instead of spawning a
    // second server (which would leak the first child/pipe).
    if let Some(existing) = claim_start(state, &root).await {
        let server = lock(&existing).server.clone();
        return Ok(LspStatus {
            root,
            server,
            version: None,
        });
    }

    // The `root` argument is a session id of the form `{server}::{path}`. Strip the prefix to get
    // the real project root and pick the server from the prefix.
    let Some((server, actual_root)) = root.split_once("::") else {
        return Err(format!("invalid session id: {root}"));
    };
    let server = server.to_string();
    let actual_root = actual_root.to_string();

    // Resolving the binary, spawning the server and the handshake are all blocking — the handshake
    // alone can wait `HANDSHAKE_TIMEOUT` for a server that never answers — so they run on the
    // blocking pool and the async worker stays free for unrelated IPC.
    let started = {
        let name = server.clone();
        let overrides = StartOverrides {
            path: overrides.path.clone(),
            args: overrides.args.clone(),
        };
        tauri::async_runtime::spawn_blocking(move || launch(&name, &actual_root, &overrides))
            .await
            .map_err(|error| format!("cannot start the {server} language server: {error}"))?
    }?;

    let Started {
        root: project_root,
        mut pipe,
        legend,
    } = started;
    let frames = pipe.take_frames();
    let session = Arc::new(Mutex::new(Session {
        server: server.to_string(),
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
        semantic_types: legend.types,
        semantic_modifiers: legend.modifiers,
    }));

    let pump_session = Arc::clone(&session);
    // The event's root is the project the window has open, not the session id: the frontend drops
    // every publish whose root is not the canonical project root, so a session id here silenced the
    // whole diagnostics pipeline. It is also the canonical path (`/private/var` over `/var`), which
    // is what `open_project` reported to the window in the first place.
    let pump_root = project_root;
    thread::Builder::new()
        .name("quarry-lsp-pump".to_string())
        .spawn(move || pump(app, pump_root, frames, pump_session))
        .map_err(|error| format!("cannot start the {server} reader thread: {error}"))?;

    lock(&state.sessions).insert(root.clone(), session);

    Ok(LspStatus {
        root,
        server: server.to_string(),
        version: None,
    })
}
