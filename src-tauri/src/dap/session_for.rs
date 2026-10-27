#![allow(unused_imports)]

pub(crate) use crate::protocol_pipe::{FrameError, ProcessPipe};
pub(crate) use crate::resolve;
pub(crate) use crate::types::{
    BreakpointSpec, DapBreakpoint, DapFrame, DapOutputEvent, DapScope, DapSession, DapStoppedEvent,
    DapThread, DapVariable, DataBreakpointInfo, DisassembledInstruction, ExceptionFilter,
    LaunchConfig, MemoryDump,
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

/// The only place a poisoned lock is recovered: a panicking pump thread must not turn every later
/// command into an error.
pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poison| poison.into_inner())
}
pub fn session_for(state: &DapState, id: &str) -> Result<Arc<Session>, String> {
    lock(&state.sessions)
        .get(id)
        .cloned()
        .ok_or_else(|| format!("no debug session {id}"))
}

/// A response's body, or the adapter's own message when it failed.
pub fn response_result(message: &Value) -> Result<Value, String> {
    if message
        .get("success")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Ok(message.get("body").cloned().unwrap_or(Value::Null));
    }

    Err(message
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("no message")
        .to_string())
}

/// A response to an adapter-initiated request: acknowledged with a null body.
pub fn server_response(seq: i64, request: &Value) -> Value {
    json!({
        "seq": seq,
        "type": "response",
        "request_seq": request.get("seq").cloned().unwrap_or(Value::Null),
        "success": true,
        "command": request.get("command").cloned().unwrap_or(Value::Null),
        "body": Value::Null,
    })
}

pub fn emit_stopped(app: &AppHandle, payload: DapStoppedEvent) {
    let _ = app.emit("dap://stopped", payload);
}

pub fn emit_terminated(app: &AppHandle, session: &str) {
    let _ = app.emit("dap://terminated", json!({ "session": session }));
}

/// Never blocks the pump and never panics when no window is listening.
pub fn emit_output(app: &AppHandle, payload: DapOutputEvent) {
    let _ = app.emit("dap://output", payload);
}

/// The `stopped` body plus the location the pump looked up for it.
pub fn stopped_event(
    session: &str,
    body: &Value,
    source: Option<String>,
    line: Option<u32>,
) -> DapStoppedEvent {
    DapStoppedEvent {
        session: session.to_string(),
        reason: body
            .get("reason")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        description: body
            .get("description")
            .and_then(Value::as_str)
            .map(str::to_string),
        thread_id: body
            .get("threadId")
            .and_then(Value::as_u64)
            .map(|id| id as u32),
        line,
        source,
    }
}

/// The DAP command for a step kind, rejecting anything the UI might invent.
pub fn step_command(kind: &str) -> Result<&'static str, String> {
    match kind {
        "next" => Ok("next"),
        "stepIn" => Ok("stepIn"),
        "stepOut" => Ok("stepOut"),
        other => Err(format!(
            "unknown step kind {other:?}: expected next, stepIn or stepOut"
        )),
    }
}

pub fn entries(body: &Value, key: &str) -> Vec<Value> {
    body.get(key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

pub fn breakpoints_from(body: &Value) -> Vec<DapBreakpoint> {
    entries(body, "breakpoints")
        .iter()
        .map(|entry| DapBreakpoint {
            id: entry.get("id").and_then(Value::as_u64).map(|id| id as u32),
            verified: entry
                .get("verified")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            line: entry
                .get("line")
                .and_then(Value::as_u64)
                .map(|line| line as u32),
            message: entry
                .get("message")
                .and_then(Value::as_str)
                .map(str::to_string),
            source: entry
                .get("source")
                .and_then(|source| source.get("path"))
                .and_then(Value::as_str)
                .map(str::to_string),
        })
        .collect()
}
