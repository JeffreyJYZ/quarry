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

/// `initialize`, `launch`, then wait for `initialized`. `configurationDone` is the caller's job.
pub fn handshake_launch(
    pipe: &mut ProcessPipe,
    adapter: &str,
    config: &LaunchConfig,
    cwd: &str,
) -> Result<Vec<ExceptionFilter>, String> {
    let mut reverse_seq = FIRST_REQUEST_SEQ;
    let filters = initialize(pipe, adapter, &mut reverse_seq)?;

    pipe.send(&json!({
        "seq": SESSION_SEQ,
        "type": "request",
        "command": "launch",
        "arguments": {
            "program": &config.program,
            "args": &config.args,
            "cwd": cwd,
            "stopOnEntry": config.stop_on_entry,
            "initCommands": &config.init_commands,
        },
    }))
    .map_err(|error| format!("cannot send launch to {adapter}: {error}"))?;

    let mut launched = false;
    let mut initialized = false;
    pump_until(pipe, adapter, "launch", &mut reverse_seq, |message| {
        match message.get("type").and_then(Value::as_str) {
            Some("response")
                if message.get("request_seq").and_then(Value::as_i64) == Some(SESSION_SEQ) =>
            {
                response_result(message)
                    .map_err(|error| format!("{adapter} rejected launch: {error}"))?;
                launched = true;
            }
            Some("event")
                if message.get("event").and_then(Value::as_str) == Some("initialized") =>
            {
                initialized = true;
            }
            _ => {}
        }

        Ok(launched && initialized)
    })?;
    Ok(filters)
}
