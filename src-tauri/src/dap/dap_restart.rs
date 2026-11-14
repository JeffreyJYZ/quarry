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
///
/// The old id stays in the map until its replacement is registered, so a relaunch that fails leaves
/// it addressable instead of making every later command answer "no debug session".
#[tauri::command]
pub async fn dap_restart(
    app: AppHandle,
    state: State<'_, DapState>,
    session: String,
) -> Result<DapSession, String> {
    let (old, config, filters) = restart_source(&state, &session)?;

    // Resolve everything that can fail before touching the live session.
    let adapter = resolve_adapter()?;
    let cwd = real_directory(&config.cwd)?;

    old.shutdown();

    let mut command = Command::new(&adapter);
    command.current_dir(&cwd);
    command.env("PATH", resolve::child_path(Path::new(&adapter)));
    let (mut pipe, stderr) = ProcessPipe::spawn_with_stderr(&mut command)
        .map_err(|error| format!("cannot start {ADAPTER} ({adapter}) for {session}: {error}"))?;

    let adapter_filters = match handshake_launch(&mut pipe, &adapter, &config, &cwd) {
        Ok(adapter_filters) => adapter_filters,
        Err(reason) => {
            // Kill and reap the new pipe explicitly (its `Drop` is not enough), then surface the
            // error with the old entry untouched and therefore still addressable. The status and the
            // adapter's own words are what make a relaunch that cannot start diagnosable.
            let exit = pipe.exit_code(STDERR_WAIT);
            let said = stderr.wait(STDERR_WAIT);
            let _ = pipe.kill();
            return Err(format_start_failure(&adapter, &reason, &said, exit));
        }
    };

    let id = register_session(app, &state, pipe, Some(config.clone()), adapter_filters)?;

    // Only now, with a replacement registered, is the old id retired.
    if id != session {
        retire_session(&state, &session);
    }

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

/// What a restart starts from: the live handle, its launch config and its exception filters.
///
/// The entry is cloned, never removed, so a relaunch that fails leaves the old id addressable.
pub fn restart_source(
    state: &DapState,
    id: &str,
) -> Result<(Arc<Session>, LaunchConfig, Vec<String>), String> {
    let old = session_for(state, id)?;
    let config = old
        .launch_config
        .clone()
        .ok_or_else(|| format!("no debug session {id}"))?;
    let filters = lock(&old.exception_filters).clone();

    Ok((old, config, filters))
}

/// Drop the old id once its replacement is registered.
pub fn retire_session(state: &DapState, id: &str) {
    lock(&state.sessions).remove(id);
}
