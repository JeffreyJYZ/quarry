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

#[tauri::command]
pub async fn dap_stack_trace(
    state: State<'_, DapState>,
    session: String,
    thread_id: u32,
) -> Result<Vec<DapFrame>, String> {
    let body = session_for(&state, &session)?.request(
        "stackTrace",
        json!({ "threadId": thread_id, "startFrame": 0, "levels": 100 }),
    )?;

    Ok(frames_from(&body))
}

#[tauri::command]
pub async fn dap_scopes(
    state: State<'_, DapState>,
    session: String,
    frame_id: u32,
) -> Result<Vec<DapScope>, String> {
    let body = session_for(&state, &session)?.request("scopes", json!({ "frameId": frame_id }))?;

    Ok(scopes_from(&body))
}

#[tauri::command]
pub async fn dap_variables(
    state: State<'_, DapState>,
    session: String,
    variables_reference: u32,
) -> Result<Vec<DapVariable>, String> {
    let body = session_for(&state, &session)?.request(
        "variables",
        json!({ "variablesReference": variables_reference }),
    )?;

    Ok(variables_from(&body))
}

#[tauri::command]
pub async fn dap_read_memory(
    state: State<'_, DapState>,
    session: String,
    address: String,
    count: u32,
) -> Result<MemoryDump, String> {
    let body = session_for(&state, &session)?.request(
        "readMemory",
        json!({ "memoryReference": address, "count": count, "offset": 0 }),
    )?;

    let data = body.get("data").and_then(Value::as_str).unwrap_or_default();
    let bytes = base64_decode(data).map_err(|error| format!("readMemory at {address}: {error}"))?;

    Ok(MemoryDump { address, bytes })
}

#[tauri::command]
pub async fn dap_disassemble(
    state: State<'_, DapState>,
    session: String,
    address: String,
    count: u32,
) -> Result<Vec<DisassembledInstruction>, String> {
    let body = session_for(&state, &session)?.request(
        "disassemble",
        json!({
            "memoryReference": address,
            "offset": 0,
            "instructionOffset": 0,
            "instructionCount": count,
            "resolveSymbols": true,
        }),
    )?;

    Ok(instructions_from(&body))
}

#[tauri::command]
pub async fn dap_data_breakpoint_info(
    state: State<'_, DapState>,
    session: String,
    variables_reference: u32,
    name: String,
) -> Result<DataBreakpointInfo, String> {
    let body = session_for(&state, &session)?.request(
        "dataBreakpointInfo",
        json!({ "variablesReference": variables_reference, "name": name }),
    )?;

    Ok(data_breakpoint_info_from(&body))
}

#[tauri::command]
pub async fn dap_set_data_breakpoints(
    state: State<'_, DapState>,
    session: String,
    data_ids: Vec<String>,
) -> Result<Vec<DapBreakpoint>, String> {
    let breakpoints: Vec<Value> = data_ids
        .iter()
        .map(|data_id| json!({ "dataId": data_id, "accessType": "write" }))
        .collect();
    let body = session_for(&state, &session)?
        .request("setDataBreakpoints", json!({ "breakpoints": breakpoints }))?;

    Ok(breakpoints_from(&body))
}

#[tauri::command]
pub async fn dap_stop(state: State<'_, DapState>, session: String) -> Result<(), String> {
    let session = lock(&state.sessions).remove(&session);
    if let Some(session) = session {
        session.shutdown();
    }

    Ok(())
}
