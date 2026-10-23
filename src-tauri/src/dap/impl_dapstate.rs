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
    /// Ends every debug session; used on exit so no adapter outlives the window.
    pub fn shutdown_all(&self) {
        let sessions: Vec<_> = lock(&self.sessions)
            .drain()
            .map(|(_, session)| session)
            .collect();
        for session in sessions {
            session.shutdown();
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
    let mut pipe = ProcessPipe::spawn(&mut command)
        .map_err(|error| format!("cannot start {ADAPTER} ({adapter}) for {root}: {error}"))?;

    let captured_filters = match handshake_launch(&mut pipe, &adapter, &config, &cwd) {
        Ok(filters) => filters,
        Err(error) => {
            let _ = pipe.kill();
            return Err(error);
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
    let mut pipe = ProcessPipe::spawn(&mut command).map_err(|error| {
        format!("cannot start {ADAPTER} ({adapter}) to attach to {pid}: {error}")
    })?;

    let (process_name, captured_filters) = match handshake_attach(&mut pipe, &adapter, pid) {
        Ok((name, filters)) => (name, filters),
        Err(error) => {
            let _ = pipe.kill();
            return Err(error);
        }
    };

    let id = register_session(app, &state, pipe, None, captured_filters)?;

    Ok(DapSession {
        id,
        program: program_path(process_name.as_deref()),
    })
}
