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
pub use std::path::{Path, PathBuf};
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

/// The adapter's file name on this platform.
///
/// Windows runs `lldb-dap.exe`, and the resolver stats the literal name it is given, so asking for
/// the bare `lldb-dap` there never matches the installed tool: the debugger then reports itself as
/// not installed on a machine that has one.
pub fn adapter_name() -> String {
    format!("{ADAPTER}{}", std::env::consts::EXE_SUFFIX)
}

/// Where the adapter comes from on this platform, in words that name the install.
pub fn install_hint() -> &'static str {
    if cfg!(target_os = "macos") {
        "install the Xcode command line tools with `xcode-select --install`"
    } else if cfg!(windows) {
        "install LLVM (it ships lldb-dap.exe) or the Visual Studio C++ LLVM tools"
    } else {
        "install LLVM (it ships lldb-dap)"
    }
}

/// The adapter `PATH` first, then the platform's own tool lookup — `xcrun` on macOS — because a
/// GUI launch inherits a `PATH` the Apple toolchain is not on.
pub fn resolve_adapter() -> Result<String, String> {
    let name = adapter_name();
    if let Some(found) = resolve::resolve(&name) {
        return Ok(found.path.to_string_lossy().into_owned());
    }

    // A directory that carries `liblldb.dll` is where the adapter can actually start; one without it
    // holds a binary that exits before the handshake, which is what a Windows image with a broken
    // `%ProgramFiles%\LLVM` copy looks like. Preference, not exclusion: a build that links LLVM
    // statically still works from its own directory, it is only tried later.
    for directory in prefer_runnable(resolve::fallback_directories(), LOADER) {
        if let Some(path) = resolve::on_path_in(&[directory], &name) {
            return Ok(path.to_string_lossy().into_owned());
        }
    }

    Err(format!(
        "{name} not found on PATH or through the platform's tool lookup: {}",
        install_hint()
    ))
}

/// The library the Windows adapter loads from its own directory, which decides whether it can start.
pub const LOADER: &str = "liblldb.dll";

/// The same directories with the ones next to `library` first, everything else in its given order.
pub fn prefer_runnable(directories: Vec<PathBuf>, library: &str) -> Vec<PathBuf> {
    let (runnable, rest): (Vec<PathBuf>, Vec<PathBuf>) = directories
        .into_iter()
        .partition(|directory| directory.join(library).is_file());
    runnable.into_iter().chain(rest).collect()
}
