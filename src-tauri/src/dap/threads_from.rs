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

pub fn threads_from(body: &Value) -> Vec<DapThread> {
    entries(body, "threads")
        .iter()
        .map(|entry| DapThread {
            id: entry.get("id").and_then(Value::as_u64).unwrap_or(0) as u32,
            name: entry
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
        })
        .collect()
}

pub fn frames_from(body: &Value) -> Vec<DapFrame> {
    entries(body, "stackFrames")
        .iter()
        .map(|entry| DapFrame {
            id: entry.get("id").and_then(Value::as_u64).unwrap_or(0) as u32,
            name: entry
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            source: entry
                .get("source")
                .and_then(|source| source.get("path"))
                .and_then(Value::as_str)
                .map(str::to_string),
            line: entry.get("line").and_then(Value::as_u64).unwrap_or(0) as u32,
            column: entry.get("column").and_then(Value::as_u64).unwrap_or(0) as u32,
            instruction_pointer: entry
                .get("instructionPointerReference")
                .and_then(Value::as_str)
                .map(str::to_string),
        })
        .collect()
}

pub fn scopes_from(body: &Value) -> Vec<DapScope> {
    entries(body, "scopes")
        .iter()
        .map(|entry| DapScope {
            name: entry
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            variables_reference: entry
                .get("variablesReference")
                .and_then(Value::as_u64)
                .unwrap_or(0) as u32,
            expensive: entry
                .get("expensive")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        })
        .collect()
}

pub fn variables_from(body: &Value) -> Vec<DapVariable> {
    entries(body, "variables")
        .iter()
        .map(|entry| DapVariable {
            name: entry
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            value: entry
                .get("value")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            type_name: entry
                .get("type")
                .and_then(Value::as_str)
                .map(str::to_string),
            variables_reference: entry
                .get("variablesReference")
                .and_then(Value::as_u64)
                .unwrap_or(0) as u32,
            memory_reference: entry
                .get("memoryReference")
                .and_then(Value::as_str)
                .map(str::to_string),
        })
        .collect()
}

pub fn instructions_from(body: &Value) -> Vec<DisassembledInstruction> {
    entries(body, "instructions")
        .iter()
        .map(|entry| DisassembledInstruction {
            address: entry
                .get("address")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            instruction: entry
                .get("instruction")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            symbol: entry
                .get("symbol")
                .and_then(Value::as_str)
                .map(str::to_string),
        })
        .collect()
}
