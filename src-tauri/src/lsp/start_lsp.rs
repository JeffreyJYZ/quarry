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
    loop {
        {
            let sessions = lock(&state.sessions);
            if let Some(existing) = sessions.get(&root).cloned() {
                let server = lock(&existing).server.clone();
                return Ok(LspStatus {
                    root,
                    server,
                    version: None,
                });
            }
        }
        {
            let mut flight = lock(&state.in_flight);
            if !flight.contains(&root) {
                flight.insert(root.clone());
                break;
            }
        }
        thread::sleep(Duration::from_millis(10));
    }

    // The `root` argument is a session id of the form `{server}::{path}`. Strip the prefix to get
    // the real project root and pick the server from the prefix.
    let (server, actual_root) = if let Some((prefix, rest)) = root.split_once("::") {
        (prefix.to_string(), rest.to_string())
    } else {
        return Err(format!("invalid session id: {root}"));
    };
    let info = open_project(actual_root.clone())?;
    let server = server.as_str();

    // A path from settings wins over discovery; it is how a second toolchain or a wrapper script is
    // used without touching `PATH`.
    let binary = if overrides.path.trim().is_empty() {
        resolve_server(server)?
    } else {
        overrides.path.trim().to_string()
    };
    let root_uri = path_to_uri(&info.root);

    let mut command = Command::new(&binary);
    command.current_dir(&info.root);
    command.env("PATH", server_path(&binary));
    command.args(&overrides.args);
    let (mut pipe, stderr) = ProcessPipe::spawn_with_stderr(&mut command).map_err(|error| {
        format_start_failure(server, &format!("cannot start ({binary}): {error}"), "")
    })?;

    // The handshake runs on the receiver before any session exists, so no mutex is held while it
    // waits for the server.
    if let Err(reason) = handshake(&mut pipe, &root_uri, &info.name) {
        // The child is already gone, so its stderr ends within a moment; wait for it briefly so
        // the message can carry the server's own reason.
        let said = stderr.wait(STDERR_WAIT);
        return Err(format_start_failure(server, &reason, &said));
    }

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
    }));

    let pump_session = Arc::clone(&session);
    let pump_root = root.clone();
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
