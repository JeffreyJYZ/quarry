//! One language-server session per project root.
//!
//! Unit U6 owns the body of this file. Contract: spawn the server for the project kind with
//! `protocol_pipe`, perform the `initialize` / `initialized` handshake, synchronise documents with
//! full-document `didOpen` / `didChange` / `didClose`, and forward `textDocument/publishDiagnostics`
//! as the `lsp://diagnostics` event (payload `DiagnosticsEvent`). No completion, hover or navigation
//! in this slice. Never write into the source tree, never bundle a server.
//!
//! Locking rule: the session map and a single session are never held across a blocking read. The
//! handshake reads frames before any lock exists, and the pump thread only locks a session for the
//! short write that answers a server request.

use crate::project::open_project;
use crate::protocol_pipe::{FrameError, ProcessPipe};
use crate::types::{Diagnostic, DiagnosticsEvent, LspStatus, Position, ProjectKind, Range};
use serde_json::{Value, json};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, State};

/// How long `initialize` may take before the session is declared dead.
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(20);

/// Request ids this module sends. Only `initialize` and `shutdown` are requests; document sync is a
/// notification, so two fixed ids are enough and there is no counter to get wrong.
const INITIALIZE_ID: i64 = 1;
const SHUTDOWN_ID: i64 = 2;

/// Held by Tauri as managed state; one entry per project root.
#[derive(Default)]
pub struct LspState {
    pub sessions: Mutex<HashMap<String, Arc<Mutex<Session>>>>,
}

/// A live server process plus the documents opened against it.
pub struct Session {
    server: String,
    pipe: ProcessPipe,
    /// Open document path to the version last sent, so `didChange` speaks the same version the
    /// server last heard.
    documents: HashMap<String, u32>,
}

impl Session {
    /// Say goodbye and kill the child. Safe to call twice: a killed child rejects further frames,
    /// and those errors are deliberately ignored here.
    fn stop(&mut self) {
        let _ = self
            .pipe
            .send(&request(SHUTDOWN_ID, "shutdown", Value::Null));
        let _ = self.pipe.send(&notification("exit", Value::Null));
        let _ = self.pipe.kill();
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        // `ProcessPipe`'s own `Drop` kills and reaps; this only gives the server a chance to shut
        // down cleanly when the session goes away without `stop_lsp` (app exit, thread failure).
        let _ = self
            .pipe
            .send(&request(SHUTDOWN_ID, "shutdown", Value::Null));
        let _ = self.pipe.send(&notification("exit", Value::Null));
    }
}

#[tauri::command]
pub async fn start_lsp(
    app: AppHandle,
    state: State<'_, LspState>,
    root: String,
) -> Result<LspStatus, String> {
    if let Some(existing) = lock(&state.sessions).get(&root).cloned() {
        let server = lock(&existing).server.clone();
        return Ok(LspStatus {
            root,
            server,
            version: None,
        });
    }

    let info = open_project(root.clone())?;
    let server = match info.kind {
        ProjectKind::Cargo => "rust-analyzer",
        ProjectKind::Cmake | ProjectKind::CompileCommands => "clangd",
        ProjectKind::Unknown => {
            return Err(format!(
                "no language server for {root}: the directory has no Cargo.toml, CMakeLists.txt or \
                 compile_commands.json"
            ));
        }
    };

    let binary = resolve_server(server)?;
    let root_uri = path_to_uri(&info.root);

    let mut command = Command::new(&binary);
    command.current_dir(&info.root);
    let mut pipe = ProcessPipe::spawn(&mut command)
        .map_err(|error| format!("cannot start {server} ({binary}): {error}"))?;

    // The handshake runs on the receiver before any session exists, so no mutex is held while it
    // waits for the server.
    handshake(server, &mut pipe, &root_uri, &info.name)?;

    let frames = pipe.take_frames();
    let session = Arc::new(Mutex::new(Session {
        server: server.to_string(),
        pipe,
        documents: HashMap::new(),
    }));

    let pump_session = Arc::clone(&session);
    let pump_root = root.clone();
    thread::Builder::new()
        .name("quarry-lsp-pump".to_string())
        .spawn(move || pump(app, pump_root, frames, pump_session))
        .map_err(|error| format!("cannot start the {server} reader thread: {error}"))?;

    lock(&state.sessions).insert(root.clone(), session);

    Ok(LspStatus {
        root,
        server: server.to_string(),
        version: None,
    })
}

#[tauri::command]
pub async fn stop_lsp(state: State<'_, LspState>, root: String) -> Result<(), String> {
    let session = lock(&state.sessions).remove(&root);
    let Some(session) = session else {
        return Ok(());
    };

    lock(&session).stop();
    Ok(())
}

#[tauri::command]
pub async fn lsp_open_document(
    state: State<'_, LspState>,
    root: String,
    path: String,
    text: String,
) -> Result<(), String> {
    let session = session_for(&state, &root)?;
    let mut session = lock(&session);

    let version = 1;
    session.documents.insert(path.clone(), version);

    let message = notification(
        "textDocument/didOpen",
        json!({
            "textDocument": {
                "uri": path_to_uri(&path),
                "languageId": language_id(&path),
                "version": version,
                "text": text,
            }
        }),
    );
    send(&mut session, "textDocument/didOpen", &message)
}

#[tauri::command]
pub async fn lsp_change_document(
    state: State<'_, LspState>,
    root: String,
    path: String,
    text: String,
) -> Result<(), String> {
    let session = session_for(&state, &root)?;
    let mut session = lock(&session);

    let version = session.documents.get(&path).copied().unwrap_or(0) + 1;
    session.documents.insert(path.clone(), version);

    let message = notification(
        "textDocument/didChange",
        json!({
            "textDocument": { "uri": path_to_uri(&path), "version": version },
            "contentChanges": [{ "text": text }],
        }),
    );
    send(&mut session, "textDocument/didChange", &message)
}

#[tauri::command]
pub async fn lsp_close_document(
    state: State<'_, LspState>,
    root: String,
    path: String,
) -> Result<(), String> {
    let session = session_for(&state, &root)?;
    let mut session = lock(&session);

    session.documents.remove(&path);

    let message = notification(
        "textDocument/didClose",
        json!({ "textDocument": { "uri": path_to_uri(&path) } }),
    );
    send(&mut session, "textDocument/didClose", &message)
}

/// Emit helper the unit must keep so the payload shape stays in one place.
pub fn emit_diagnostics(app: &AppHandle, payload: DiagnosticsEvent) {
    use tauri::Emitter;
    let _ = app.emit("lsp://diagnostics", payload);
}

/// The only writer of a session mutex that is allowed to fail on a poisoned lock: a panicking
/// reader thread must not turn every later document command into an error.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poison| poison.into_inner())
}

fn session_for(state: &LspState, root: &str) -> Result<Arc<Mutex<Session>>, String> {
    lock(&state.sessions)
        .get(root)
        .cloned()
        .ok_or_else(|| format!("no language server session for {root}"))
}

fn send(session: &mut Session, method: &str, message: &Value) -> Result<(), String> {
    session
        .pipe
        .send(message)
        .map_err(|error| format!("{}: cannot send {method}: {error}", session.server))
}

fn request(id: i64, method: &str, params: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
}

fn notification(method: &str, params: Value) -> Value {
    json!({ "jsonrpc": "2.0", "method": method, "params": params })
}

/// `initialize` out, wait for its response, `initialized` out.
///
/// While waiting, server-to-client requests are answered, because a server that asks about
/// configuration before replying would otherwise deadlock against our own wait.
fn handshake(
    server: &str,
    pipe: &mut ProcessPipe,
    root_uri: &str,
    name: &str,
) -> Result<(), String> {
    let params = json!({
        "processId": std::process::id(),
        "rootUri": root_uri,
        "capabilities": {},
        "workspaceFolders": [{ "uri": root_uri, "name": name }],
    });
    pipe.send(&request(INITIALIZE_ID, "initialize", params))
        .map_err(|error| format!("cannot send initialize to {server}: {error}"))?;

    let deadline = Instant::now() + HANDSHAKE_TIMEOUT;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(format!(
                "{server} did not answer initialize within {}s",
                HANDSHAKE_TIMEOUT.as_secs()
            ));
        }

        match pipe.frames.recv_timeout(remaining) {
            Ok(Ok(message)) => {
                let is_response = message.get("method").is_none();
                if is_response && message.get("id") == Some(&json!(INITIALIZE_ID)) {
                    if let Some(error) = message.get("error") {
                        return Err(format!("{server} rejected initialize: {error}"));
                    }
                    break;
                }
                if !is_response && message.get("id").is_some() {
                    let _ = pipe.send(&server_request_response(&message));
                }
            }
            Ok(Err(error)) => {
                return Err(format!(
                    "{server} stopped before answering initialize: {error}"
                ));
            }
            Err(RecvTimeoutError::Timeout) => {
                return Err(format!(
                    "{server} did not answer initialize within {}s",
                    HANDSHAKE_TIMEOUT.as_secs()
                ));
            }
            Err(RecvTimeoutError::Disconnected) => {
                return Err(format!("{server} exited before answering initialize"));
            }
        }
    }

    pipe.send(&notification("initialized", json!({})))
        .map_err(|error| format!("cannot send initialized to {server}: {error}"))
}

/// Read frames until the child goes away, forwarding diagnostics and keeping the server unblocked.
fn pump(
    app: AppHandle,
    root: String,
    frames: Receiver<Result<Value, FrameError>>,
    session: Arc<Mutex<Session>>,
) {
    for frame in frames {
        let Ok(message) = frame else {
            break;
        };

        let Some(method) = message.get("method").and_then(Value::as_str) else {
            // A response to one of our own requests; nothing in this slice waits on one.
            continue;
        };

        if method == "textDocument/publishDiagnostics" {
            if let Some(event) = diagnostics_event(&root, message.get("params")) {
                emit_diagnostics(&app, event);
            }
            continue;
        }

        if message.get("id").is_some() {
            let response = server_request_response(&message);
            if lock(&session).pipe.send(&response).is_err() {
                break;
            }
        }
    }
}

/// Answer a server-to-client request. `workspace/configuration` gets one `null` per requested item,
/// so a server asking for a setting it may not need sees "nothing configured" and carries on;
/// everything else gets a bare `null` result.
fn server_request_response(message: &Value) -> Value {
    let id = message.get("id").cloned().unwrap_or(Value::Null);
    let result = match message.get("method").and_then(Value::as_str) {
        Some("workspace/configuration") => configuration_result(message.get("params")),
        _ => Value::Null,
    };

    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

/// `[{ items: [...] }, …]` becomes `[null, null, …]`, one entry per item.
fn configuration_result(params: Option<&Value>) -> Value {
    let count = params
        .and_then(|params| params.get("items"))
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);

    Value::Array(vec![Value::Null; count])
}

fn diagnostics_event(root: &str, params: Option<&Value>) -> Option<DiagnosticsEvent> {
    let params = params?;
    let path = uri_to_path(params.get("uri").and_then(Value::as_str)?)?;
    let reported = params.get("diagnostics").and_then(Value::as_array)?;

    Some(DiagnosticsEvent {
        root: root.to_string(),
        path: path.clone(),
        diagnostics: reported
            .iter()
            .map(|value| diagnostic(&path, value))
            .collect(),
    })
}

fn diagnostic(path: &str, value: &Value) -> Diagnostic {
    let range = value.get("range");

    Diagnostic {
        path: path.to_string(),
        range: Range {
            start: position(range.and_then(|range| range.get("start"))),
            end: position(range.and_then(|range| range.get("end"))),
        },
        // LSP severity is optional; an absent value reads as an error, and the scale tops out at 4.
        severity: value
            .get("severity")
            .and_then(Value::as_u64)
            .unwrap_or(1)
            .clamp(1, 4) as u8,
        message: value
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        source: value
            .get("source")
            .and_then(Value::as_str)
            .map(str::to_string),
    }
}

fn position(point: Option<&Value>) -> Position {
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
fn path_to_uri(path: &str) -> String {
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
fn uri_to_path(uri: &str) -> Option<String> {
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
fn language_id(path: &str) -> &'static str {
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
fn resolve_server(server: &str) -> Result<String, String> {
    if let Some(found) = find_on_path(server) {
        return Ok(found);
    }
    if let Some(found) = find_with_xcrun(server) {
        return Ok(found);
    }

    Err(format!(
        "{server} not found on PATH or through xcrun; {}",
        fix_for(server)
    ))
}

/// What the user does about a missing server.
fn fix_for(server: &str) -> &'static str {
    match server {
        "rust-analyzer" => "install it with `rustup component add rust-analyzer`",
        _ => "install the Xcode command line tools with `xcode-select --install`",
    }
}

fn find_on_path(name: &str) -> Option<String> {
    let path = env::var_os("PATH")?;

    env::split_paths(&path).find_map(|directory| {
        if directory.as_os_str().is_empty() {
            return None;
        }

        let candidate = directory.join(name);
        is_executable(&candidate).then(|| candidate.to_string_lossy().into_owned())
    })
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    // `metadata` follows symlinks, so a shim that links to the real binary counts as a hit.
    fs::metadata(path)
        .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    fs::metadata(path)
        .map(|meta| meta.is_file())
        .unwrap_or(false)
}

fn find_with_xcrun(name: &str) -> Option<String> {
    let output = Command::new("xcrun").args(["--find", name]).output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let found = stdout.lines().next()?.trim();
    if found.is_empty() || !Path::new(found).exists() {
        return None;
    }

    Some(found.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uri_roundtrip_keeps_spaces_hashes_percents_and_non_ascii() {
        let paths = [
            "/Users/jyz/dev/monorepos/quarry/src-tauri/src/lsp.rs",
            "/Users/jyz/dev/my project/a#b?.rs",
            "/Users/jyz/dev/50%25/naïve/日本語.rs",
            "/tmp/trailing space ",
        ];

        for path in paths {
            let uri = path_to_uri(path);
            assert!(uri.starts_with("file:///"), "uri should be absolute: {uri}");
            assert!(
                !uri.contains(' ') && !uri.contains('#') && !uri.contains('?'),
                "uri must be encoded: {uri}"
            );
            assert_eq!(uri_to_path(&uri).as_deref(), Some(path), "uri: {uri}");
        }
    }

    #[test]
    fn uri_decoding_rejects_foreign_schemes_and_bad_escapes() {
        assert_eq!(uri_to_path("untitled:Untitled-1"), None);
        assert_eq!(uri_to_path("file:///tmp/%ZZ.rs"), None);
        assert_eq!(
            uri_to_path("file:///tmp/plain.rs").as_deref(),
            Some("/tmp/plain.rs")
        );
    }

    #[test]
    fn language_id_follows_the_extension() {
        assert_eq!(language_id("/p/src/main.rs"), "rust");
        assert_eq!(language_id("/p/src/MAIN.RS"), "rust");
        for name in [
            "a.c", "a.h", "a.cc", "a.cpp", "a.hpp", "a.cxx", "a.hh", "a.CPP",
        ] {
            assert_eq!(language_id(name), "cpp", "{name}");
        }
        assert_eq!(language_id("/p/README.md"), "plaintext");
        assert_eq!(language_id("/p/Makefile"), "plaintext");
    }

    #[test]
    fn configuration_response_is_one_null_per_requested_item() {
        let params = json!({ "items": [{ "section": "rust" }, {}, {}] });
        assert_eq!(
            configuration_result(Some(&params)),
            json!([null, null, null])
        );
        assert_eq!(configuration_result(Some(&json!({}))), json!([]));
        assert_eq!(configuration_result(None), json!([]));

        let response = server_request_response(&json!({
            "jsonrpc": "2.0",
            "id": 7,
            "method": "workspace/configuration",
            "params": { "items": [{}, {}] },
        }));
        assert_eq!(response["id"], json!(7));
        assert_eq!(response["result"], json!([null, null]));
    }

    #[test]
    fn unknown_server_requests_are_answered_with_null() {
        let response = server_request_response(&json!({
            "jsonrpc": "2.0",
            "id": "abc",
            "method": "client/registerCapability",
            "params": { "registrations": [] },
        }));

        assert_eq!(response["id"], json!("abc"));
        assert_eq!(response["result"], Value::Null);
    }

    #[test]
    fn diagnostics_event_maps_uri_to_an_absolute_path() {
        let path = "/tmp/project/src/main.rs";
        let params = json!({
            "uri": path_to_uri(path),
            "diagnostics": [{
                "range": { "start": { "line": 3, "character": 4 }, "end": { "line": 3, "character": 9 } },
                "message": "cannot find value",
                "severity": 1,
                "source": "rust-analyzer",
            }],
        });

        let event = diagnostics_event("/tmp/project", Some(&params)).expect("event");
        assert_eq!(event.path, path);
        assert_eq!(event.root, "/tmp/project");
        assert_eq!(event.diagnostics.len(), 1);

        let diagnostic = &event.diagnostics[0];
        assert_eq!(diagnostic.path, path);
        assert_eq!(diagnostic.range.start.line, 3);
        assert_eq!(diagnostic.range.end.character, 9);
        assert_eq!(diagnostic.severity, 1);
        assert_eq!(diagnostic.message, "cannot find value");
        assert_eq!(diagnostic.source.as_deref(), Some("rust-analyzer"));
    }
}
