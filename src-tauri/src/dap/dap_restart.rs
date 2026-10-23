#![allow(unused_imports)]

pub(crate) use crate::protocol_pipe::{FrameError, ProcessPipe};
pub(crate) use crate::resolve;
pub(crate) use crate::types::{
    BreakpointSpec, DapBreakpoint, DapFrame, DapScope, DapSession, DapStoppedEvent, DapThread,
    DapVariable, DataBreakpointInfo, DisassembledInstruction, ExceptionFilter, LaunchConfig,
    MemoryDump,
};
pub use serde_json::{Map, Value, json};
pub use std::collections::HashMap;
pub use std::fs;
pub use std::io;
pub use std::path::Path;
pub use std::process::Command;
pub use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU32, AtomicU64, Ordering};
pub use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
pub use std::sync::{Arc, Mutex, MutexGuard};
pub use std::thread;
pub use std::time::{Duration, Instant};
pub use tauri::{AppHandle, Emitter, State};

use super::*;

/// Restart a debug session: terminate the existing one and launch a fresh one with the same
/// launch parameters it was created with.
///
/// lldb-dap advertises neither `supportsRestartRequest` nor `supportsTerminateRequest`, so there is
/// no `restart` DAP request to send: this is implemented as a best-effort `disconnect`, kill and
/// removal followed by a full relaunch. Breakpoints are not re-sent by the backend; the frontend
/// re-pushes them on relaunch.
#[tauri::command]
pub async fn dap_restart(
    app: AppHandle,
    state: State<'_, DapState>,
    session: String,
) -> Result<DapSession, String> {
    let old = lock(&state.sessions)
        .remove(&session)
        .ok_or_else(|| format!("no debug session {session}"))?;

    let config = old
        .launch_config
        .clone()
        .ok_or_else(|| format!("no debug session {session}"))?;

    // Preserve the last exception-breakpoint filters so they can be re-applied below.
    let filters = lock(&old.exception_filters).clone();

    old.shutdown();

    let adapter = resolve_adapter()?;
    let cwd = real_directory(&config.cwd)?;

    let mut command = Command::new(&adapter);
    command.current_dir(&cwd);
    command.env("PATH", resolve::child_path(Path::new(&adapter)));
    let mut pipe = ProcessPipe::spawn(&mut command)
        .map_err(|error| format!("cannot start {ADAPTER} ({adapter}) for {session}: {error}"))?;

    let adapter_filters = match handshake_launch(&mut pipe, &adapter, &config, &cwd) {
        Ok(adapter_filters) => adapter_filters,
        Err(error) => {
            let _ = pipe.kill();
            return Err(error);
        }
    };

    let id = register_session(app, &state, pipe, Some(config.clone()), adapter_filters)?;

    // Re-apply the exception-breakpoint filters the old session had. A failure here is
    // intentionally swallowed: the new session is still returned, with no error to the UI.
    if let Some(session) = lock(&state.sessions).get(&id).cloned() {
        *lock(&session.exception_filters) = filters.clone();
        let _ = session.request(
            "setExceptionBreakpoints",
            exception_breakpoints_arguments(&filters),
        );
    }

    Ok(DapSession {
        id,
        program: config.program,
    })
}
