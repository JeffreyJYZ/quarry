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

/// `initialize`, then `attach` to a running process.
///
/// The attach response is what the handshake waits for: lldb-dap does not promise an `initialized`
/// event for an attach, so requiring it would turn a working attach into a timeout. The name the
/// adapter reports for the process comes back with it, when it reports one.
pub fn handshake_attach(
    pipe: &mut ProcessPipe,
    adapter: &str,
    pid: u32,
) -> Result<(Option<String>, Vec<ExceptionFilter>), String> {
    let mut reverse_seq = FIRST_REQUEST_SEQ;
    let filters = initialize(pipe, adapter, &mut reverse_seq)?;

    pipe.send(&json!({
        "seq": SESSION_SEQ,
        "type": "request",
        "command": "attach",
        "arguments": attach_arguments(pid),
    }))
    .map_err(|error| format!("cannot send attach to {adapter}: {error}"))?;

    let mut attached = false;
    let mut process_name: Option<String> = None;
    pump_until(pipe, adapter, "attach", &mut reverse_seq, |message| {
        match message.get("type").and_then(Value::as_str) {
            Some("response")
                if message.get("request_seq").and_then(Value::as_i64) == Some(SESSION_SEQ) =>
            {
                response_result(message)
                    .map_err(|error| format!("{adapter} rejected attach: {error}"))?;
                attached = true;
            }
            Some("event") if message.get("event").and_then(Value::as_str) == Some("process") => {
                process_name = process_name_from(message.get("body"));
            }
            _ => {}
        }

        Ok(attached)
    })?;

    Ok((process_name, filters))
}
/// The `initialize` request; the adapter answers with its capabilities.
pub fn initialize(
    pipe: &mut ProcessPipe,
    adapter: &str,
    reverse_seq: &mut i64,
) -> Result<Vec<ExceptionFilter>, String> {
    pipe.send(&json!({
        "seq": INITIALIZE_SEQ,
        "type": "request",
        "command": "initialize",
        "arguments": {
            "clientID": "quarry",
            "clientName": "quarry",
            "adapterID": "lldb",
            "linesStartAt1": true,
            "columnsStartAt1": true,
            "pathFormat": "path",
            "supportsVariableType": true,
            "supportsVariablePaging": true,
            "supportsMemoryReferences": true,
            "supportsRunInTerminalRequest": false,
        },
    }))
    .map_err(|error| format!("cannot send initialize to {adapter}: {error}"))?;

    let mut filters = Vec::new();
    pump_until(pipe, adapter, "initialize", reverse_seq, |message| {
        if message.get("request_seq").and_then(Value::as_i64) != Some(INITIALIZE_SEQ) {
            return Ok(false);
        }
        let body = response_result(message)
            .map_err(|error| format!("{adapter} rejected initialize: {error}"))?;
        filters = exception_filters_from(&body);
        Ok(true)
    })?;
    Ok(filters)
}

/// The `attach` arguments: the pid under both spellings, and no stop on entry.
///
/// The DAP spec names the field `processId`; lldb-dap has also accepted `pid`, so both are sent
/// and the adapter takes the one it knows.
pub fn attach_arguments(pid: u32) -> Value {
    json!({
        "pid": pid,
        "processId": pid,
        "stopOnEntry": false,
    })
}

/// The name the adapter reports for a process, when it reports one.
pub fn process_name_from(body: Option<&Value>) -> Option<String> {
    body.and_then(|body| body.get("name"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// The process path the adapter reported, or an empty string when it reported only a name.
///
/// lldb-dap names the attached executable without a directory, so this is normally empty.
pub fn program_path(name: Option<&str>) -> String {
    match name {
        Some(name) if name.contains('/') => name.to_string(),
        _ => String::new(),
    }
}

/// Read frames until `check` says the handshake step is done, answering server requests on the way.
pub fn pump_until<F>(
    pipe: &mut ProcessPipe,
    adapter: &str,
    what: &str,
    reverse_seq: &mut i64,
    mut check: F,
) -> Result<(), String>
where
    F: FnMut(&Value) -> Result<bool, String>,
{
    let deadline = Instant::now() + REQUEST_TIMEOUT;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(format!(
                "{adapter} did not answer {what} within {}s",
                REQUEST_TIMEOUT.as_secs()
            ));
        }

        match pipe.frames.recv_timeout(remaining) {
            Ok(Ok(message)) => {
                if message.get("type").and_then(Value::as_str) == Some("request") {
                    let response = server_response(*reverse_seq, &message);
                    *reverse_seq += 1;
                    let _ = pipe.send(&response);
                    continue;
                }
                if check(&message)? {
                    return Ok(());
                }
            }
            Ok(Err(error)) => {
                return Err(format!(
                    "{adapter} stopped before it could answer {what}: {error}"
                ));
            }
            Err(RecvTimeoutError::Timeout) => {
                return Err(format!(
                    "{adapter} did not answer {what} within {}s",
                    REQUEST_TIMEOUT.as_secs()
                ));
            }
            Err(RecvTimeoutError::Disconnected) => {
                return Err(format!("{adapter} exited before it could answer {what}"));
            }
        }
    }
}
