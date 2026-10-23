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

/// Write bytes into the debuggee's memory. `bytes` arrive as raw values from the memory pane.
#[tauri::command]
pub async fn dap_write_memory(
    state: State<'_, DapState>,
    session: String,
    address: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    if bytes.is_empty() {
        return Err("writeMemory: `bytes` must not be empty".to_string());
    }

    let arguments = write_memory_arguments(&address, &bytes);

    session_for(&state, &session)?
        .request("writeMemory", arguments)
        .map(|_| ())
}

/// Build the `writeMemory` request arguments for `address` and `bytes`.
///
/// The address is passed through unchanged: prefixed addresses keep their `0x` and the adapter's
/// unprefixed `dataId`-shaped addresses are accepted as-is.
pub fn write_memory_arguments(address: &str, bytes: &[u8]) -> Value {
    json!({
        "memoryReference": address,
        "data": base64_encode(bytes),
        "offset": 0,
    })
}

/// Change a variable's value in the debuggee (DAP `setVariable`).
pub fn validate_set_variable(name: &str, value: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("setVariable: `name` must not be empty".to_string());
    }
    if value.is_empty() {
        return Err("setVariable: `value` must not be empty".to_string());
    }
    Ok(())
}

pub fn set_variable_arguments(variables_reference: u32, name: &str, value: &str) -> Value {
    json!({
        "variablesReference": variables_reference,
        "name": name,
        "value": value,
    })
}

pub fn set_variable_result(body: &Value) -> Result<(), String> {
    if body.get("value").and_then(Value::as_str).is_some() {
        Ok(())
    } else {
        Err("setVariable: the adapter returned no value".to_string())
    }
}

#[tauri::command]
pub async fn dap_set_variable(
    state: State<'_, DapState>,
    session: String,
    variables_reference: u32,
    name: String,
    value: String,
) -> Result<(), String> {
    validate_set_variable(&name, &value)?;

    let arguments = set_variable_arguments(variables_reference, &name, &value);

    let body = session_for(&state, &session)?.request("setVariable", arguments)?;
    set_variable_result(&body)
}

/// Enable exception-style breakpoints. Filters come from the adapter's own `exceptionBreakpointFilters`.
///
/// An empty list is valid and clears them. The last filters are kept on the session so `dap_restart`
/// can re-apply them after relaunch.
#[tauri::command]
pub async fn dap_set_exception_breakpoints(
    state: State<'_, DapState>,
    session: String,
    filters: Vec<String>,
) -> Result<(), String> {
    let session = session_for(&state, &session)?;
    let arguments = exception_breakpoints_arguments(&filters);
    session.request("setExceptionBreakpoints", arguments)?;
    *lock(&session.exception_filters) = filters;
    Ok(())
}

/// Build the DAP arguments for `setExceptionBreakpoints`.
pub fn exception_breakpoints_arguments(filters: &[String]) -> Value {
    json!({ "filters": filters })
}
