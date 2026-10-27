//! Debug sessions over DAP.
//!
//! One `lldb-dap` child per session, request/response correlation by `seq`, events forwarded to the
//! UI, and the measured facts in `docs/spikes/dap.md` taken as given (no `evaluate`, no gating on
//! `supportsMemoryReferences`, `dataId` without `0x`, `realpath` the project before launch).
//!
//! Locking rule: the session map and a single session are never held across a blocking read. The
//! `initialize` / `launch` handshake reads frames before any session exists, and the pump thread
//! only locks a session for the short write that answers a server request.

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

// The adapter's own exception-breakpoint filters, captured from `initialize`.
#[tauri::command]
pub async fn dap_exception_filters(
    state: State<'_, DapState>,
    session: String,
) -> Result<Vec<ExceptionFilter>, String> {
    let session = session_for(&state, &session)?;
    Ok(lock(&session.exception_breakpoint_filters).clone())
}
// Parse `exceptionBreakpointFilters` from an `initialize` response body.
pub fn exception_filters_from(body: &Value) -> Vec<ExceptionFilter> {
    body.get("exceptionBreakpointFilters")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| {
                    let filter = entry.get("filter").and_then(Value::as_str)?;
                    let label = entry
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or(filter)
                        .to_string();
                    let default = entry
                        .get("default")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);
                    Some(ExceptionFilter {
                        filter: filter.to_string(),
                        label,
                        default,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}
mod adapter;
pub use adapter::*;

mod impl_session;
pub use impl_session::*;

mod impl_dapstate;
pub use impl_dapstate::*;

mod dap_configuration_done;
pub use dap_configuration_done::*;

mod dap_stack_trace;
pub use dap_stack_trace::*;

mod dap_restart;
pub use dap_restart::*;

mod impl_pump_1;
pub use impl_pump_1::*;

mod pump_events;
pub use pump_events::*;

mod handshake_launch;
pub use handshake_launch::*;

mod initialize;
pub use initialize::*;

mod session_for;
pub use session_for::*;

mod threads_from;
pub use threads_from::*;

mod data_breakpoint_info_from;
pub use data_breakpoint_info_from::*;

mod tests_1;
pub use tests_1::*;

mod tests_2;
pub use tests_2::*;

mod tests_3;
pub use tests_3::*;

mod dap_write_memory;
pub use dap_write_memory::*;

mod exception_filters_from;
pub use exception_filters_from::*;
