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

/// Start a debug session and return once the adapter is configured and waiting for breakpoints.
///
/// `configurationDone` is deliberately not sent here: the caller sets breakpoints first.
impl DapState {
    /// Ends every debug session; used when the window goes away and on exit, so no adapter
    /// outlives it.
    pub fn shutdown_all(&self) {
        let sessions: Vec<(String, Arc<Session>)> = lock(&self.sessions).drain().collect();
        for (id, session) in sessions {
            session.shutdown();
            crate::logging::dap_exited(&id, "stopped (app exit)");
        }
    }
}

#[tauri::command]
pub async fn dap_launch(
    app: AppHandle,
    state: State<'_, DapState>,
    root: String,
    config: LaunchConfig,
) -> Result<DapSession, String> {
    let adapter = resolve_adapter()?;
    // LLDB canonicalises the DWARF source path, so a `/var/…` cwd leaves every breakpoint
    // unverified. Resolve the directory before the child inherits it.
    let cwd = real_directory(&config.cwd)?;

    let mut command = Command::new(&adapter);
    command.current_dir(&cwd);
    command.env("PATH", resolve::child_path(Path::new(&adapter)));
    let (mut pipe, stderr) = ProcessPipe::spawn_with_stderr(&mut command).map_err(|error| {
        let message = format!("cannot start {ADAPTER} ({adapter}) for {root}: {error}");
        crate::logging::dap_failed(&root, &message);
        message
    })?;

    let captured_filters = match handshake_launch(&mut pipe, &adapter, &config, &cwd) {
        Ok(filters) => filters,
        Err(reason) => {
            // The child is already gone or about to be: wait briefly so the message can carry the
            // status it left and the adapter's own words, then make sure it is reaped.
            let exit = pipe.exit_code(STDERR_WAIT);
            let said = stderr.wait(STDERR_WAIT);
            let _ = pipe.kill();
            let message = format_start_failure(&adapter, &reason, &said, exit);
            crate::logging::dap_failed(&root, &message);
            return Err(message);
        }
    };

    let config_for_session = config.clone();
    let id = register_session(
        app,
        &state,
        pipe,
        Some(config_for_session),
        captured_filters,
    )?;
    crate::logging::dap_started(&id, &config.program);

    Ok(DapSession {
        id,
        program: config.program,
    })
}

/// Attach to a running process and return a session every other command can drive.
///
/// The session is the same kind the launch makes: breakpoints, stepping, threads and memory all
/// work on it. `program` is the process path when the adapter reported one and otherwise an empty
/// string; lldb-dap names the attached executable without a directory, so the value is normally
/// empty.
#[tauri::command]
pub async fn dap_attach(
    app: AppHandle,
    state: State<'_, DapState>,
    pid: u32,
) -> Result<DapSession, String> {
    let adapter = resolve_adapter()?;

    let mut command = Command::new(&adapter);
    command.env("PATH", resolve::child_path(Path::new(&adapter)));
    let (mut pipe, stderr) = ProcessPipe::spawn_with_stderr(&mut command).map_err(|error| {
        let message = format!("cannot start {ADAPTER} ({adapter}) to attach to {pid}: {error}");
        crate::logging::dap_failed(&format!("attach {pid}"), &message);
        message
    })?;

    let (process_name, captured_filters) = match handshake_attach(&mut pipe, &adapter, pid) {
        Ok((name, filters)) => (name, filters),
        Err(reason) => {
            let exit = pipe.exit_code(STDERR_WAIT);
            let said = stderr.wait(STDERR_WAIT);
            let _ = pipe.kill();
            let message = format_start_failure(&adapter, &reason, &said, exit);
            crate::logging::dap_failed(&format!("attach {pid}"), &message);
            return Err(message);
        }
    };

    let id = register_session(app, &state, pipe, None, captured_filters)?;
    crate::logging::dap_started(&id, &format!("attach {pid}"));

    Ok(DapSession {
        id,
        program: program_path(process_name.as_deref()),
    })
}
