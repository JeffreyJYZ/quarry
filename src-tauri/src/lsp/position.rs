#![allow(unused_imports)]

pub(crate) use crate::project::open_project;
pub(crate) use crate::protocol_pipe::{FrameError, ProcessPipe};
pub(crate) use crate::resolve;
pub(crate) use crate::types::{
    CallHierarchyNode, CodeAction, CompletionItem, CompletionList, Diagnostic, DiagnosticsEvent,
    FileEdit, HoverInfo, InlayHint, Location, LspStatus, Position, ProjectKind, Range,
    SignatureHelp, SignatureInformation, Symbol, TextEdit, WorkspaceSymbol,
};
pub use serde::Serialize;
pub use serde_json::{Value, json};
pub use std::collections::HashMap;
pub use std::path::Path;
pub use std::process::Command;
pub use std::sync::mpsc::{Receiver, RecvTimeoutError};
pub use std::sync::{Arc, Mutex, MutexGuard};
pub use std::thread;
pub use std::time::{Duration, Instant};
pub use tauri::{AppHandle, State};
pub use tokio::sync::oneshot;

use super::*;

pub fn position(point: Option<&Value>) -> Position {
    Position {
        line: point
            .and_then(|point| point.get("line"))
            .and_then(Value::as_u64)
            .unwrap_or(0) as u32,
        character: point
            .and_then(|point| point.get("character"))
            .and_then(Value::as_u64)
            .unwrap_or(0) as u32,
    }
}

/// `file://` plus an absolute path, percent-encoding everything outside the unreserved set and `/`.
pub fn path_to_uri(path: &str) -> String {
    let mut uri = String::from("file://");

    for byte in path.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' => {
                uri.push(*byte as char);
            }
            other => uri.push_str(&format!("%{other:02X}")),
        }
    }

    uri
}

/// Reverse of [`path_to_uri`]; `None` for a URI this IDE cannot own, such as `untitled:`.
pub fn uri_to_path(uri: &str) -> Option<String> {
    let encoded = uri.strip_prefix("file://")?;
    let bytes = encoded.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).ok()?;
            decoded.push(u8::from_str_radix(hex, 16).ok()?);
            index += 3;
            continue;
        }

        decoded.push(bytes[index]);
        index += 1;
    }

    String::from_utf8(decoded).ok()
}

/// The LSP `languageId` for a document, decided by extension alone.
pub fn language_id(path: &str) -> &'static str {
    let extension = Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    match extension.as_str() {
        "rs" => "rust",
        "c" | "h" | "cc" | "cpp" | "hpp" | "cxx" | "hh" => "cpp",
        _ => "plaintext",
    }
}

/// `PATH` first, then `xcrun`, exactly as the toolchain report probes: a GUI-launched app inherits
/// launchd's `PATH`, so an Apple-shipped `clangd` is only reachable through `xcrun`.
/// The `PATH` a spawned server runs with.
///
/// A GUI-launched app inherits launchd's `PATH`, which lacks the rustup shims; a rustup-installed
/// `rust-analyzer` then dies at startup because it cannot find `cargo`. Put the server's own directory
/// and the usual toolchain directories in front of the inherited value.
pub fn server_path(binary: &str) -> std::ffi::OsString {
    resolve::child_path(Path::new(binary))
}

pub fn resolve_server(server: &str) -> Result<String, String> {
    if let Some(found) = resolve::resolve(server) {
        return Ok(found.path.to_string_lossy().into_owned());
    }

    Err(format!(
        "{server} not found on PATH or through xcrun; {}",
        fix_for(server)
    ))
}
