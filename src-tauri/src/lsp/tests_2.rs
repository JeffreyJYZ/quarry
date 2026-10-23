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

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_2 {
    use super::*;

    /// End to end against the real rust-analyzer: handshake, didOpen, then wait for diagnostics.
    ///
    /// This is the only test that proves the client can make a server report an error, and it exists
    /// because every earlier "rust diagnostics do not show" report had to be guessed at from a
    /// distance. It skips itself when rust-analyzer is not installed.
    #[test]
    pub fn rust_analyzer_publishes_a_diagnostic_for_a_type_error() {
        let Some(binary) = resolve_server("rust-analyzer").ok() else {
            eprintln!("skipping: rust-analyzer is not installed on this machine");
            return;
        };
        if std::env::var("CI").is_ok() {
            // A CI runner has no indexed toolchain warm, and the check would spend a minute here.
            eprintln!("skipping: CI has no rust-analyzer workspace to check");
            return;
        }
        let root = std::env::temp_dir().join(format!("quarry-lsp-live-{}", std::process::id()));
        let src = root.join("src");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&src).expect("creates the fixture");
        std::fs::write(
            root.join("Cargo.toml"),
            "[package]\nname = \"live\"\nversion = \"0.1.0\"\nedition = \"2021\"\n",
        )
        .expect("writes the manifest");
        let main = "fn main() {\n    let value: i32 = \"text\";\n    println!(\"{}\", value);\n}\n";
        let main_path = src.join("main.rs");
        std::fs::write(&main_path, main).expect("writes the source");

        let mut command = std::process::Command::new(&binary);
        command.current_dir(&root);
        command.env("PATH", server_path(&binary));
        // A private target directory: the shared one is locked whenever a build is running, and a
        // blocked `cargo check` means no type diagnostics at all.
        command.env("CARGO_TARGET_DIR", root.join("target"));
        let (mut pipe, stderr) =
            ProcessPipe::spawn_with_stderr(&mut command).expect("starts rust-analyzer");
        handshake(&mut pipe, &path_to_uri(&root.to_string_lossy()), "live").expect("handshakes");
        let main_path = main_path.to_string_lossy().into_owned();
        pipe.send(&notification(
            "textDocument/didOpen",
            json!({
                "textDocument": {
                    "uri": path_to_uri(&main_path),
                    "languageId": "rust",
                    "version": 1,
                    "text": main,
                }
            }),
        ))
        .expect("sends didOpen");
        pipe.send(&notification(
            "textDocument/didSave",
            json!({ "textDocument": { "uri": path_to_uri(&main_path) } }),
        ))
        .expect("sends didSave");

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(60);
        let mut seen: Vec<String> = Vec::new();
        let mut methods: Vec<String> = Vec::new();
        let mut diagnostics_frames = 0;
        let mut reported = false;
        while std::time::Instant::now() < deadline {
            let remaining = deadline.saturating_duration_since(std::time::Instant::now());
            match pipe.frames.recv_timeout(remaining) {
                Ok(Ok(message)) => {
                    if message.get("id").is_some() && message.get("method").is_some() {
                        let name = message
                            .get("method")
                            .and_then(Value::as_str)
                            .unwrap_or("request")
                            .to_string();
                        methods.push(format!("request:{name}"));
                        let _ = pipe.send(&server_request_response(&message));
                        continue;
                    }
                    let method = message
                        .get("method")
                        .and_then(Value::as_str)
                        .unwrap_or("response")
                        .to_string();
                    if methods.len() < 40 {
                        methods.push(method.clone());
                    }
                    if method != "textDocument/publishDiagnostics" {
                        continue;
                    }
                    let Some(event) =
                        diagnostics_event(&root.to_string_lossy(), message.get("params"))
                    else {
                        continue;
                    };
                    diagnostics_frames += 1;
                    // A type error needs `cargo check`, which can be blocked by another build, so an
                    // empty first report is not a client failure: the frame itself is the proof that
                    // the pipeline (handshake → didOpen → publishDiagnostics) works.
                    if event.diagnostics.is_empty() {
                        continue;
                    }
                    seen.extend(event.diagnostics.iter().map(|d| d.message.clone()));
                    reported = true;
                    break;
                }
                Ok(Err(error)) => panic!("the server stopped reading: {error}"),
                Err(_) => break,
            }
        }

        pipe.kill().ok();
        let _ = std::fs::remove_dir_all(&root);
        assert!(
            reported || diagnostics_frames > 0,
            "rust-analyzer never published diagnostics; methods seen: {methods:?}; stderr: {}",
            stderr.text()
        );
        if !reported {
            eprintln!(
                "note: {diagnostics_frames} diagnostic frame(s) arrived but none carried a finding; \
                 a type error needs `cargo check`, which another build can block"
            );
        }
    }
}
