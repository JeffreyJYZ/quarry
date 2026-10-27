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

/// The category an `output` body without one is reported under.
pub const DEFAULT_OUTPUT_CATEGORY: &str = "stdout";

/// What the pump does with one of the adapter's events.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EventRoute {
    Stopped,
    Output,
    Terminated,
    /// Everything else (`initialized`, `breakpoint`, …) needs nothing beyond a log.
    Ignored,
}

/// The dispatch table, kept apart from the handlers so it can be asserted without an app handle.
pub fn event_route(name: &str) -> EventRoute {
    match name {
        "stopped" => EventRoute::Stopped,
        "output" => EventRoute::Output,
        "terminated" | "exited" => EventRoute::Terminated,
        _ => EventRoute::Ignored,
    }
}

/// Act on one event: record a stop, forward what the debuggee printed, end the session.
pub fn dispatch_event(pump: &mut Pump, name: &str, body: &Value) {
    match event_route(name) {
        EventRoute::Stopped => on_stopped(pump, body),
        EventRoute::Output => on_output(pump, body),
        EventRoute::Terminated => emit_terminated(&pump.app, &pump.session.id),
        EventRoute::Ignored => {}
    }
}

fn on_stopped(pump: &mut Pump, body: &Value) {
    if let Some(thread_id) = body.get("threadId").and_then(Value::as_u64) {
        pump.session
            .stopped_thread
            .store(thread_id as u32, Ordering::SeqCst);
    }
    // DAP's `stopped` body carries no location, so the UI needs the top frame.
    let (source, line) = pump.top_frame(body);
    emit_stopped(
        &pump.app,
        stopped_event(&pump.session.id, body, source, line),
    );
}

fn on_output(pump: &Pump, body: &Value) {
    if let Some(payload) = output_event(&pump.session.id, body) {
        emit_output(&pump.app, payload);
    }
}

/// The `output` body as the UI's payload, or `None` when it carries no text to print.
pub fn output_event(session: &str, body: &Value) -> Option<DapOutputEvent> {
    let output = body.get("output").and_then(Value::as_str)?;
    let category = body
        .get("category")
        .and_then(Value::as_str)
        .unwrap_or(DEFAULT_OUTPUT_CATEGORY);

    Some(DapOutputEvent {
        session: session.to_string(),
        category: category.to_string(),
        output: output.to_string(),
    })
}
