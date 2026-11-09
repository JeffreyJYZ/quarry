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

/// The thread a command acts on: the one the UI named, else the thread that stopped last.
///
/// `0` is not a DAP thread id, so a command with no recorded stop and no explicit thread is refused
/// instead of being sent a request the adapter cannot answer.
pub fn select_thread(command: &str, explicit: Option<u32>, recorded: u32) -> Result<u32, String> {
    match explicit.filter(|id| *id != 0) {
        Some(id) => Ok(id),
        None if recorded != 0 => Ok(recorded),
        None => Err(format!(
            "{command}: no stopped thread; wait for a stop or pass a thread id"
        )),
    }
}

#[tauri::command]
pub async fn dap_threads(
    state: State<'_, DapState>,
    session: String,
) -> Result<Vec<DapThread>, String> {
    let body = session_for(&state, &session)?.request("threads", json!({}))?;

    Ok(threads_from(&body))
}
