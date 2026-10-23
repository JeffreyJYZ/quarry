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

pub fn data_breakpoint_info_from(body: &Value) -> DataBreakpointInfo {
    DataBreakpointInfo {
        data_id: body
            .get("dataId")
            .and_then(Value::as_str)
            .map(str::to_string),
        description: body
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        access_types: body
            .get("accessTypes")
            .and_then(Value::as_array)
            .map(|types| {
                types
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default(),
    }
}

/// Standard base64 with `=` padding, encoded without a crate.
pub fn base64_encode(bytes: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let first = usize::from(chunk[0]);
        let second = usize::from(chunk.get(1).copied().unwrap_or(0));
        let third = usize::from(chunk.get(2).copied().unwrap_or(0));
        let value = (first << 16) | (second << 8) | third;

        output.push(char::from(ALPHABET[value >> 18]));
        output.push(char::from(ALPHABET[(value >> 12) & 0x3f]));
        if chunk.len() > 1 {
            output.push(char::from(ALPHABET[(value >> 6) & 0x3f]));
        } else {
            output.push('=');
        }
        if chunk.len() > 2 {
            output.push(char::from(ALPHABET[value & 0x3f]));
        } else {
            output.push('=');
        }
    }

    output
}

/// Standard base64 with `=` padding, decoded without a crate.
///
/// Whitespace is skipped, padding is only accepted at the tail, and a stray character is an error,
/// because a wrong decode would silently corrupt the hex view.
pub fn base64_decode(text: &str) -> Result<Vec<u8>, String> {
    let bytes = text.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len() / 4 * 3);
    let mut buffer = 0u32;
    let mut bits = 0u32;

    for (index, byte) in bytes.iter().enumerate() {
        let sextet = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' => {
                if bytes[index..].iter().any(|byte| *byte != b'=') {
                    return Err(format!("padding at byte {index} is not at the tail"));
                }
                break;
            }
            b' ' | b'\t' | b'\r' | b'\n' => continue,
            other => {
                return Err(format!(
                    "invalid base64 character {:?} at byte {index}",
                    *other as char
                ));
            }
        };

        buffer = (buffer << 6) | u32::from(sextet);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            decoded.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }

    Ok(decoded)
}

/// `PATH` first, then `xcrun`: a GUI-launched app inherits launchd's `PATH`, so the Apple-shipped
/// `lldb-dap` is only reachable through `xcrun`.
pub fn resolve_adapter() -> Result<String, String> {
    if let Some(found) = resolve::resolve(ADAPTER) {
        return Ok(found.path.to_string_lossy().into_owned());
    }

    Err(format!(
        "{ADAPTER} not found on PATH or through xcrun; install the Xcode command line tools with \
         `xcode-select --install`"
    ))
}
