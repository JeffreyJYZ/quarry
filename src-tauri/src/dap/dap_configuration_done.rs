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

/// Register a live session and start the reader thread that drives it.
pub fn register_session(
    app: AppHandle,
    state: &DapState,
    mut pipe: ProcessPipe,
    launch_config: Option<LaunchConfig>,
    exception_breakpoint_filters: Vec<ExceptionFilter>,
) -> Result<String, String> {
    let frames = pipe.take_frames();
    let id = format!("dap-{}", state.counter.fetch_add(1, Ordering::SeqCst) + 1);
    let mut session = Session::new(id.clone(), pipe);
    session.launch_config = launch_config;
    *lock(&session.exception_breakpoint_filters) = exception_breakpoint_filters;
    let session = Arc::new(session);

    let pump = Pump {
        app,
        session: Arc::clone(&session),
        frames,
        deferred: Vec::new(),
        depth: 0,
    };
    thread::Builder::new()
        .name("quarry-dap-pump".to_string())
        .spawn(move || pump.run())
        .map_err(|error| {
            session.shutdown();
            lock(&state.sessions).remove(&id);
            format!("cannot start the {ADAPTER} reader thread: {error}")
        })?;

    lock(&state.sessions).insert(id.clone(), session);

    Ok(id)
}
#[tauri::command]
pub async fn dap_configuration_done(
    state: State<'_, DapState>,
    session: String,
) -> Result<(), String> {
    session_for(&state, &session)?
        .request("configurationDone", json!({}))
        .map(|_| ())
}

#[tauri::command]
pub async fn dap_set_breakpoints(
    state: State<'_, DapState>,
    session: String,
    path: String,
    lines: Vec<u32>,
) -> Result<Vec<DapBreakpoint>, String> {
    let breakpoints: Vec<Value> = lines.iter().map(|line| json!({ "line": line })).collect();
    let body = session_for(&state, &session)?.request(
        "setBreakpoints",
        json!({
            "source": { "path": path },
            "breakpoints": breakpoints,
            "sourceModified": false,
        }),
    )?;

    Ok(breakpoints_from(&body))
}

/// Set the breakpoints of one file with the DAP extras: conditions, hit counts and log messages.
///
/// The plain command stays as it is; this one carries what a breakpoint needs beyond its line. A
/// disabled breakpoint is left out of the request, so the adapter stops holding it.
#[tauri::command]
pub async fn dap_set_breakpoints_ex(
    state: State<'_, DapState>,
    session: String,
    path: String,
    breakpoints: Vec<BreakpointSpec>,
) -> Result<Vec<DapBreakpoint>, String> {
    let body = session_for(&state, &session)?.request(
        "setBreakpoints",
        json!({
            "source": { "path": path },
            "breakpoints": source_breakpoints(&breakpoints),
            "sourceModified": false,
        }),
    )?;

    Ok(breakpoints_from(&body))
}

/// Map the UI's specs to DAP `SourceBreakpoint`s, dropping the ones the UI disabled.
///
/// Only the fields the UI set are sent: an adapter that does not know a field must not see it.
pub fn source_breakpoints(specs: &[BreakpointSpec]) -> Vec<Value> {
    specs
        .iter()
        .filter(|spec| spec.enabled)
        .map(|spec| {
            let mut breakpoint = Map::new();
            breakpoint.insert("line".to_string(), json!(spec.line));
            if let Some(condition) = &spec.condition {
                breakpoint.insert("condition".to_string(), Value::String(condition.clone()));
            }
            if let Some(hit_condition) = &spec.hit_condition {
                breakpoint.insert(
                    "hitCondition".to_string(),
                    Value::String(hit_condition.clone()),
                );
            }
            if let Some(log_message) = &spec.log_message {
                breakpoint.insert("logMessage".to_string(), Value::String(log_message.clone()));
            }
            Value::Object(breakpoint)
        })
        .collect()
}

/// Continue the debuggee, on the thread the UI named or on the thread that stopped last.
#[tauri::command]
pub async fn dap_continue(
    state: State<'_, DapState>,
    session: String,
    thread_id: Option<u32>,
) -> Result<(), String> {
    let session = session_for(&state, &session)?;
    let thread_id = select_thread(thread_id, session.stopped_thread.load(Ordering::SeqCst));

    session
        .request("continue", json!({ "threadId": thread_id }))
        .map(|_| ())
}

/// Step, on the thread the UI named or on the thread that stopped last.
///
/// `kind` is `next`, `stepIn` or `stepOut`.
#[tauri::command]
pub async fn dap_step(
    state: State<'_, DapState>,
    session: String,
    kind: String,
    thread_id: Option<u32>,
) -> Result<(), String> {
    let command = step_command(&kind)?;
    let session = session_for(&state, &session)?;
    let thread_id = select_thread(thread_id, session.stopped_thread.load(Ordering::SeqCst));

    session
        .request(command, json!({ "threadId": thread_id }))
        .map(|_| ())
}

/// The thread a command acts on: the one the UI named, else the thread that stopped last.
pub fn select_thread(explicit: Option<u32>, recorded: u32) -> u32 {
    explicit.unwrap_or(recorded)
}

#[tauri::command]
pub async fn dap_threads(
    state: State<'_, DapState>,
    session: String,
) -> Result<Vec<DapThread>, String> {
    let body = session_for(&state, &session)?.request("threads", json!({}))?;

    Ok(threads_from(&body))
}
