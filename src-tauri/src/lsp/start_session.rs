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

/// How long a start waits before looking again at a root another start is already bringing up.
pub const RESERVE_POLL: Duration = Duration::from_millis(10);

/// What [`launch`] hands back once the server is up and has answered `initialize`.
pub struct Started {
    /// The project root the server runs in, canonicalised by [`open_project`].
    pub(crate) root: String,
    pub(crate) pipe: ProcessPipe,
    pub(crate) legend: SemanticLegend,
}

/// Wait until this root is either served or reserved by this call.
///
/// Returns the session another start registered, or `None` when this call now owns the in-flight
/// reservation and must bring the server up itself. The wait yields to the executor: two starts for
/// one root must not pin an async worker while the first server answers `initialize`.
pub(crate) async fn claim_start(state: &LspState, root: &str) -> Option<Arc<Mutex<Session>>> {
    loop {
        let found = lock(&state.sessions).get(root).cloned();
        if let Some(existing) = found {
            // A session whose server has exited can never answer again, so hand back only a live
            // one; a dead entry is dropped and this call spawns a fresh server. The map lock is
            // released before the session lock is taken, and neither is held together.
            if !lock(&existing).dead {
                return Some(existing);
            }
            let mut sessions = lock(&state.sessions);
            if sessions
                .get(root)
                .is_some_and(|current| Arc::ptr_eq(current, &existing))
            {
                sessions.remove(root);
            }
        }
        {
            let mut flight = lock(&state.in_flight);
            if !flight.contains(root) {
                flight.insert(root.to_string());
                return None;
            }
        }
        tokio::time::sleep(RESERVE_POLL).await;
    }
}

/// The blocking half of a start: open the project, resolve the server binary, spawn it and run the
/// handshake.
///
/// The handshake waits up to [`HANDSHAKE_TIMEOUT`] for `initialize`, so this belongs on the blocking
/// pool rather than an async worker.
pub(crate) fn launch(
    server: &str,
    actual_root: &str,
    overrides: &StartOverrides,
) -> Result<Started, String> {
    let info = open_project(actual_root.to_string())?;

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
    let legend = match handshake(&mut pipe, &root_uri, &info.name) {
        Ok(types) => types,
        Err(reason) => {
            // The child is already gone, so its stderr ends within a moment; wait for it briefly so
            // the message can carry the server's own reason.
            let said = stderr.wait(STDERR_WAIT);
            return Err(format_start_failure(server, &reason, &said));
        }
    };

    Ok(Started {
        root: info.root,
        pipe,
        legend,
    })
}
