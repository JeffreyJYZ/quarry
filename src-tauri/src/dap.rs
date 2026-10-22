//! Debug sessions over DAP.
//!
//! One `lldb-dap` child per session, request/response correlation by `seq`, events forwarded to the
//! UI, and the measured facts in `docs/spikes/dap.md` taken as given (no `evaluate`, no gating on
//! `supportsMemoryReferences`, `dataId` without `0x`, `realpath` the project before launch).
//!
//! Locking rule: the session map and a single session are never held across a blocking read. The
//! `initialize` / `launch` handshake reads frames before any session exists, and the pump thread
//! only locks a session for the short write that answers a server request.

use crate::protocol_pipe::{FrameError, ProcessPipe};
use crate::resolve;
use crate::types::{
    BreakpointSpec, DapBreakpoint, DapFrame, DapScope, DapSession, DapStoppedEvent, DapThread,
    DapVariable, DataBreakpointInfo, DisassembledInstruction, ExceptionFilter, LaunchConfig,
    MemoryDump,
};
use serde_json::{Map, Value, json};
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

/// The adapter this crate supports; resolved through `PATH` and then `xcrun`.
const ADAPTER: &str = "lldb-dap";

/// Every request is bounded: a hung adapter fails the command instead of freezing the UI.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

/// Fixed ids for the two handshake requests; anything a session sends starts above them.
const INITIALIZE_SEQ: i64 = 1;
/// The second request of a handshake: `launch` or `attach`, never both in one session.
const SESSION_SEQ: i64 = 2;
const FIRST_REQUEST_SEQ: i64 = 3;

/// Held by Tauri as managed state: one live session per generated id.
#[derive(Default)]
pub struct DapState {
    pub sessions: Mutex<HashMap<String, Arc<Session>>>,
    /// Only ever incremented, so an id is never reused while a stale session is still draining.
    counter: AtomicU64,
}

/// A live adapter process plus the correlation state its pump resolves.
pub struct Session {
    id: String,
    /// `None` once [`Session::shutdown`] has taken the child; `ProcessPipe`'s own `Drop` reaps it.
    pipe: Mutex<Option<ProcessPipe>>,
    /// Outstanding requests, keyed by the `seq` they were sent with.
    pending: Mutex<HashMap<i64, Sender<Result<Value, String>>>>,
    seq: AtomicI64,
    /// The thread id of the last `stopped` event, which `continue` and the step commands need.
    stopped_thread: AtomicU32,
    alive: AtomicBool,
    /// The launch parameters this session was created with, so a restart can relaunch identically.
    /// `None` for sessions created by `dap_attach`.
    pub launch_config: Option<LaunchConfig>,
    /// The last exception-breakpoint filters sent, so `dap_restart` can re-apply them.
    pub exception_filters: Mutex<Vec<String>>,
    /// The adapter's exception-breakpoint filters, captured during `initialize`.
    pub exception_breakpoint_filters: Mutex<Vec<ExceptionFilter>>,
}

impl Session {
    fn new(id: String, pipe: ProcessPipe) -> Self {
        Session {
            id,
            pipe: Mutex::new(Some(pipe)),
            pending: Mutex::new(HashMap::new()),
            seq: AtomicI64::new(FIRST_REQUEST_SEQ),
            stopped_thread: AtomicU32::new(0),
            alive: AtomicBool::new(true),
            launch_config: None,
            exception_filters: Mutex::new(Vec::new()),
            exception_breakpoint_filters: Mutex::new(Vec::new()),
        }
    }

    fn next_seq(&self) -> i64 {
        self.seq.fetch_add(1, Ordering::SeqCst)
    }

    fn write(&self, message: &Value) -> io::Result<()> {
        let mut pipe = lock(&self.pipe);
        match pipe.as_mut() {
            Some(pipe) => pipe.send(message),
            None => Err(io::Error::new(
                io::ErrorKind::NotConnected,
                "the session is closed",
            )),
        }
    }

    /// Send one request and wait for its response, at most [`REQUEST_TIMEOUT`].
    fn request(&self, command: &str, arguments: Value) -> Result<Value, String> {
        if !self.alive.load(Ordering::SeqCst) {
            return Err(format!(
                "{command}: the debug session {} is closed",
                self.id
            ));
        }

        let seq = self.next_seq();
        let (sender, receiver) = mpsc::channel();
        lock(&self.pending).insert(seq, sender);

        let message = json!({
            "seq": seq,
            "type": "request",
            "command": command,
            "arguments": arguments,
        });
        if let Err(error) = self.write(&message) {
            lock(&self.pending).remove(&seq);
            return Err(format!("{command}: cannot send to {ADAPTER}: {error}"));
        }

        match receiver.recv_timeout(REQUEST_TIMEOUT) {
            Ok(Ok(body)) => Ok(body),
            Ok(Err(message)) => Err(format!("{command} failed: {message}")),
            Err(RecvTimeoutError::Timeout) => {
                lock(&self.pending).remove(&seq);
                Err(format!(
                    "{command} timed out after {}s",
                    REQUEST_TIMEOUT.as_secs()
                ))
            }
            Err(RecvTimeoutError::Disconnected) => {
                Err(format!("{command}: {ADAPTER} stopped answering"))
            }
        }
    }

    /// Hand a response to the request that is waiting on it. `false` when nothing was waiting.
    fn resolve(&self, message: &Value) -> bool {
        let Some(request_seq) = message.get("request_seq").and_then(Value::as_i64) else {
            return false;
        };
        let Some(sender) = lock(&self.pending).remove(&request_seq) else {
            return false;
        };

        let _ = sender.send(response_result(message));
        true
    }

    /// Release every waiting request with `reason`, so a dead adapter fails commands immediately.
    fn fail_pending(&self, reason: &str) {
        let pending = std::mem::take(&mut *lock(&self.pending));
        for (_, sender) in pending {
            let _ = sender.send(Err(reason.to_string()));
        }
    }

    /// Say goodbye, kill and reap the child, and fail anything still waiting. Idempotent.
    fn shutdown(&self) {
        if self.alive.swap(false, Ordering::SeqCst) {
            let _ = self.write(&json!({
                "seq": self.next_seq(),
                "type": "request",
                "command": "disconnect",
                "arguments": { "terminateDebuggee": true, "restart": false },
            }));
        }

        let pipe = lock(&self.pipe).take();
        if let Some(mut pipe) = pipe {
            let _ = pipe.kill();
        }
        self.fail_pending("the debug session is closed");
    }
}

impl std::fmt::Debug for Session {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Session").field("id", &self.id).finish()
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.shutdown();
    }
}

/// Start a debug session and return once the adapter is configured and waiting for breakpoints.
///
/// `configurationDone` is deliberately not sent here: the caller sets breakpoints first.
#[tauri::command]
pub async fn dap_launch(
    app: AppHandle,
    state: State<'_, DapState>,
    root: String,
    config: LaunchConfig,
) -> Result<DapSession, String> {
    let adapter = resolve_adapter()?;
    // LLDB canonicalises the DWARF source path, so a `/var/…` cwd leaves every breakpoint
    // unverified. Resolve the directory before the child inherits it.
    let cwd = real_directory(&config.cwd)?;

    let mut command = Command::new(&adapter);
    command.current_dir(&cwd);
    command.env("PATH", resolve::child_path(Path::new(&adapter)));
    let mut pipe = ProcessPipe::spawn(&mut command)
        .map_err(|error| format!("cannot start {ADAPTER} ({adapter}) for {root}: {error}"))?;

    let captured_filters = match handshake_launch(&mut pipe, &adapter, &config, &cwd) {
        Ok(filters) => filters,
        Err(error) => {
            let _ = pipe.kill();
            return Err(error);
        }
    };

    let config_for_session = config.clone();
    let id = register_session(
        app,
        &state,
        pipe,
        Some(config_for_session),
        captured_filters,
    )?;

    Ok(DapSession {
        id,
        program: config.program,
    })
}

/// Attach to a running process and return a session every other command can drive.
///
/// The session is the same kind the launch makes: breakpoints, stepping, threads and memory all
/// work on it. `program` is the process path when the adapter reported one and otherwise an empty
/// string; lldb-dap names the attached executable without a directory, so the value is normally
/// empty.
#[tauri::command]
pub async fn dap_attach(
    app: AppHandle,
    state: State<'_, DapState>,
    pid: u32,
) -> Result<DapSession, String> {
    let adapter = resolve_adapter()?;

    let mut command = Command::new(&adapter);
    command.env("PATH", resolve::child_path(Path::new(&adapter)));
    let mut pipe = ProcessPipe::spawn(&mut command).map_err(|error| {
        format!("cannot start {ADAPTER} ({adapter}) to attach to {pid}: {error}")
    })?;

    let (process_name, captured_filters) = match handshake_attach(&mut pipe, &adapter, pid) {
        Ok((name, filters)) => (name, filters),
        Err(error) => {
            let _ = pipe.kill();
            return Err(error);
        }
    };

    let id = register_session(app, &state, pipe, None, captured_filters)?;

    Ok(DapSession {
        id,
        program: program_path(process_name.as_deref()),
    })
}

/// Register a live session and start the reader thread that drives it.
fn register_session(
    app: AppHandle,
    state: &DapState,
    mut pipe: ProcessPipe,
    launch_config: Option<LaunchConfig>,
    exception_breakpoint_filters: Vec<ExceptionFilter>,
) -> Result<String, String> {
    let frames = pipe.take_frames();
    let id = format!("dap-{}", state.counter.fetch_add(1, Ordering::SeqCst) + 1);
    let mut session = Session::new(id.clone(), pipe);
    session.launch_config = launch_config;
    *lock(&session.exception_breakpoint_filters) = exception_breakpoint_filters;
    let session = Arc::new(session);

    let pump = Pump {
        app,
        session: Arc::clone(&session),
        frames,
        deferred: Vec::new(),
        depth: 0,
    };
    thread::Builder::new()
        .name("quarry-dap-pump".to_string())
        .spawn(move || pump.run())
        .map_err(|error| {
            session.shutdown();
            lock(&state.sessions).remove(&id);
            format!("cannot start the {ADAPTER} reader thread: {error}")
        })?;

    lock(&state.sessions).insert(id.clone(), session);

    Ok(id)
}

#[tauri::command]
pub async fn dap_configuration_done(
    state: State<'_, DapState>,
    session: String,
) -> Result<(), String> {
    session_for(&state, &session)?
        .request("configurationDone", json!({}))
        .map(|_| ())
}

#[tauri::command]
pub async fn dap_set_breakpoints(
    state: State<'_, DapState>,
    session: String,
    path: String,
    lines: Vec<u32>,
) -> Result<Vec<DapBreakpoint>, String> {
    let breakpoints: Vec<Value> = lines.iter().map(|line| json!({ "line": line })).collect();
    let body = session_for(&state, &session)?.request(
        "setBreakpoints",
        json!({
            "source": { "path": path },
            "breakpoints": breakpoints,
            "sourceModified": false,
        }),
    )?;

    Ok(breakpoints_from(&body))
}

/// Set the breakpoints of one file with the DAP extras: conditions, hit counts and log messages.
///
/// The plain command stays as it is; this one carries what a breakpoint needs beyond its line. A
/// disabled breakpoint is left out of the request, so the adapter stops holding it.
#[tauri::command]
pub async fn dap_set_breakpoints_ex(
    state: State<'_, DapState>,
    session: String,
    path: String,
    breakpoints: Vec<BreakpointSpec>,
) -> Result<Vec<DapBreakpoint>, String> {
    let body = session_for(&state, &session)?.request(
        "setBreakpoints",
        json!({
            "source": { "path": path },
            "breakpoints": source_breakpoints(&breakpoints),
            "sourceModified": false,
        }),
    )?;

    Ok(breakpoints_from(&body))
}

/// Map the UI's specs to DAP `SourceBreakpoint`s, dropping the ones the UI disabled.
///
/// Only the fields the UI set are sent: an adapter that does not know a field must not see it.
fn source_breakpoints(specs: &[BreakpointSpec]) -> Vec<Value> {
    specs
        .iter()
        .filter(|spec| spec.enabled)
        .map(|spec| {
            let mut breakpoint = Map::new();
            breakpoint.insert("line".to_string(), json!(spec.line));
            if let Some(condition) = &spec.condition {
                breakpoint.insert("condition".to_string(), Value::String(condition.clone()));
            }
            if let Some(hit_condition) = &spec.hit_condition {
                breakpoint.insert(
                    "hitCondition".to_string(),
                    Value::String(hit_condition.clone()),
                );
            }
            if let Some(log_message) = &spec.log_message {
                breakpoint.insert("logMessage".to_string(), Value::String(log_message.clone()));
            }
            Value::Object(breakpoint)
        })
        .collect()
}

/// Continue the debuggee, on the thread the UI named or on the thread that stopped last.
#[tauri::command]
pub async fn dap_continue(
    state: State<'_, DapState>,
    session: String,
    thread_id: Option<u32>,
) -> Result<(), String> {
    let session = session_for(&state, &session)?;
    let thread_id = select_thread(thread_id, session.stopped_thread.load(Ordering::SeqCst));

    session
        .request("continue", json!({ "threadId": thread_id }))
        .map(|_| ())
}

/// Step, on the thread the UI named or on the thread that stopped last.
///
/// `kind` is `next`, `stepIn` or `stepOut`.
#[tauri::command]
pub async fn dap_step(
    state: State<'_, DapState>,
    session: String,
    kind: String,
    thread_id: Option<u32>,
) -> Result<(), String> {
    let command = step_command(&kind)?;
    let session = session_for(&state, &session)?;
    let thread_id = select_thread(thread_id, session.stopped_thread.load(Ordering::SeqCst));

    session
        .request(command, json!({ "threadId": thread_id }))
        .map(|_| ())
}

/// The thread a command acts on: the one the UI named, else the thread that stopped last.
fn select_thread(explicit: Option<u32>, recorded: u32) -> u32 {
    explicit.unwrap_or(recorded)
}

#[tauri::command]
pub async fn dap_threads(
    state: State<'_, DapState>,
    session: String,
) -> Result<Vec<DapThread>, String> {
    let body = session_for(&state, &session)?.request("threads", json!({}))?;

    Ok(threads_from(&body))
}

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

/// Restart a debug session: terminate the existing one and launch a fresh one with the same
/// launch parameters it was created with.
///
/// lldb-dap advertises neither `supportsRestartRequest` nor `supportsTerminateRequest`, so there is
/// no `restart` DAP request to send: this is implemented as a best-effort `disconnect`, kill and
/// removal followed by a full relaunch. Breakpoints are not re-sent by the backend; the frontend
/// re-pushes them on relaunch.
#[tauri::command]
pub async fn dap_restart(
    app: AppHandle,
    state: State<'_, DapState>,
    session: String,
) -> Result<DapSession, String> {
    let old = lock(&state.sessions)
        .remove(&session)
        .ok_or_else(|| format!("no debug session {session}"))?;

    let config = old
        .launch_config
        .clone()
        .ok_or_else(|| format!("no debug session {session}"))?;

    // Preserve the last exception-breakpoint filters so they can be re-applied below.
    let filters = lock(&old.exception_filters).clone();

    old.shutdown();

    let adapter = resolve_adapter()?;
    let cwd = real_directory(&config.cwd)?;

    let mut command = Command::new(&adapter);
    command.current_dir(&cwd);
    command.env("PATH", resolve::child_path(Path::new(&adapter)));
    let mut pipe = ProcessPipe::spawn(&mut command)
        .map_err(|error| format!("cannot start {ADAPTER} ({adapter}) for {session}: {error}"))?;

    let adapter_filters = match handshake_launch(&mut pipe, &adapter, &config, &cwd) {
        Ok(adapter_filters) => adapter_filters,
        Err(error) => {
            let _ = pipe.kill();
            return Err(error);
        }
    };

    let id = register_session(app, &state, pipe, Some(config.clone()), adapter_filters)?;

    // Re-apply the exception-breakpoint filters the old session had. A failure here is
    // intentionally swallowed: the new session is still returned, with no error to the UI.
    if let Some(session) = lock(&state.sessions).get(&id).cloned() {
        *lock(&session.exception_filters) = filters.clone();
        let _ = session.request(
            "setExceptionBreakpoints",
            exception_breakpoints_arguments(&filters),
        );
    }

    Ok(DapSession {
        id,
        program: config.program,
    })
}

/// Read frames off the adapter and keep both sides unblocked.
struct Pump {
    app: AppHandle,
    session: Arc<Session>,
    frames: Receiver<Result<Value, FrameError>>,
    /// Messages seen while a stop was being enriched; replayed in order afterwards.
    deferred: Vec<Value>,
    /// Set while the pump issues a request of its own, which must never nest another one.
    depth: u8,
}

impl Pump {
    fn run(mut self) {
        while let Some(message) = self.next() {
            self.handle(message);
        }

        self.session.fail_pending(&format!("{ADAPTER} stopped"));
        self.session.alive.store(false, Ordering::SeqCst);
    }

    fn next(&mut self) -> Option<Value> {
        if !self.deferred.is_empty() {
            return Some(self.deferred.remove(0));
        }

        match self.frames.recv() {
            Ok(Ok(value)) => Some(value),
            // A framing error is the end of the stream, exactly like a closed channel.
            Ok(Err(_)) | Err(_) => None,
        }
    }

    fn handle(&mut self, message: Value) {
        match message.get("type").and_then(Value::as_str) {
            Some("response") => {
                self.session.resolve(&message);
            }
            Some("event") => self.event(&message),
            Some("request") => {
                // Adapter-initiated request (`runInTerminal`, `startDebugging`, …). Nothing here
                // can serve one, so acknowledge with a null body instead of deadlocking.
                let response = server_response(self.session.next_seq(), &message);
                let _ = self.session.write(&response);
            }
            _ => {}
        }
    }

    fn event(&mut self, message: &Value) {
        let Some(name) = message.get("event").and_then(Value::as_str) else {
            return;
        };
        let body = message.get("body").cloned().unwrap_or(Value::Null);

        match name {
            "stopped" => {
                if let Some(thread_id) = body.get("threadId").and_then(Value::as_u64) {
                    self.session
                        .stopped_thread
                        .store(thread_id as u32, Ordering::SeqCst);
                }
                // DAP's `stopped` body carries no location, so the UI needs the top frame.
                let (source, line) = self.top_frame(&body);
                emit_stopped(
                    &self.app,
                    stopped_event(&self.session.id, &body, source, line),
                );
            }
            "terminated" | "exited" => emit_terminated(&self.app, &self.session.id),
            // `output`, `initialized`, `breakpoint` and the rest need nothing beyond a log.
            _ => {}
        }
    }

    /// Where the stop happened: the top frame's source path and line, if the adapter gives them.
    fn top_frame(&mut self, body: &Value) -> (Option<String>, Option<u32>) {
        let Some(thread_id) = body.get("threadId").and_then(Value::as_u64) else {
            return (None, None);
        };

        let Some(response) = self.request(
            "stackTrace",
            json!({ "threadId": thread_id, "startFrame": 0, "levels": 1 }),
        ) else {
            return (None, None);
        };

        let top = response
            .get("stackFrames")
            .and_then(Value::as_array)
            .and_then(|frames| frames.first());
        let Some(top) = top else {
            return (None, None);
        };

        (
            top.get("source")
                .and_then(|source| source.get("path"))
                .and_then(Value::as_str)
                .map(str::to_string),
            top.get("line")
                .and_then(Value::as_u64)
                .map(|line| line as u32),
        )
    }

    /// A request the pump makes itself, reading its own response off the stream.
    ///
    /// Any other message that arrives meanwhile is deferred, because the pump is the only reader.
    fn request(&mut self, command: &str, arguments: Value) -> Option<Value> {
        if self.depth > 0 {
            return None;
        }

        self.depth += 1;
        let result = self.request_inner(command, arguments);
        self.depth -= 1;
        result
    }

    fn request_inner(&mut self, command: &str, arguments: Value) -> Option<Value> {
        let seq = self.session.next_seq();
        let message = json!({
            "seq": seq,
            "type": "request",
            "command": command,
            "arguments": arguments,
        });
        self.session.write(&message).ok()?;

        let deadline = Instant::now() + REQUEST_TIMEOUT;
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return None;
            }

            match self.frames.recv_timeout(remaining) {
                Ok(Ok(value)) => {
                    let is_ours = value.get("type").and_then(Value::as_str) == Some("response")
                        && value.get("request_seq").and_then(Value::as_i64) == Some(seq);
                    if is_ours {
                        return match response_result(&value) {
                            Ok(body) => Some(body),
                            Err(_) => None,
                        };
                    }
                    self.deferred.push(value);
                }
                Ok(Err(_)) | Err(_) => return None,
            }
        }
    }
}

/// `initialize`, `launch`, then wait for `initialized`. `configurationDone` is the caller's job.
fn handshake_launch(
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

/// `initialize`, then `attach` to a running process.
///
/// The attach response is what the handshake waits for: lldb-dap does not promise an `initialized`
/// event for an attach, so requiring it would turn a working attach into a timeout. The name the
/// adapter reports for the process comes back with it, when it reports one.
fn handshake_attach(
    pipe: &mut ProcessPipe,
    adapter: &str,
    pid: u32,
) -> Result<(Option<String>, Vec<ExceptionFilter>), String> {
    let mut reverse_seq = FIRST_REQUEST_SEQ;
    let filters = initialize(pipe, adapter, &mut reverse_seq)?;

    pipe.send(&json!({
        "seq": SESSION_SEQ,
        "type": "request",
        "command": "attach",
        "arguments": attach_arguments(pid),
    }))
    .map_err(|error| format!("cannot send attach to {adapter}: {error}"))?;

    let mut attached = false;
    let mut process_name: Option<String> = None;
    pump_until(pipe, adapter, "attach", &mut reverse_seq, |message| {
        match message.get("type").and_then(Value::as_str) {
            Some("response")
                if message.get("request_seq").and_then(Value::as_i64) == Some(SESSION_SEQ) =>
            {
                response_result(message)
                    .map_err(|error| format!("{adapter} rejected attach: {error}"))?;
                attached = true;
            }
            Some("event") if message.get("event").and_then(Value::as_str) == Some("process") => {
                process_name = process_name_from(message.get("body"));
            }
            _ => {}
        }

        Ok(attached)
    })?;

    Ok((process_name, filters))
}

/// The `initialize` request; the adapter answers with its capabilities.
fn initialize(
    pipe: &mut ProcessPipe,
    adapter: &str,
    reverse_seq: &mut i64,
) -> Result<Vec<ExceptionFilter>, String> {
    pipe.send(&json!({
        "seq": INITIALIZE_SEQ,
        "type": "request",
        "command": "initialize",
        "arguments": {
            "clientID": "quarry",
            "clientName": "quarry",
            "adapterID": "lldb",
            "linesStartAt1": true,
            "columnsStartAt1": true,
            "pathFormat": "path",
            "supportsVariableType": true,
            "supportsVariablePaging": true,
            "supportsMemoryReferences": true,
            "supportsRunInTerminalRequest": false,
        },
    }))
    .map_err(|error| format!("cannot send initialize to {adapter}: {error}"))?;

    let mut filters = Vec::new();
    pump_until(pipe, adapter, "initialize", reverse_seq, |message| {
        if message.get("request_seq").and_then(Value::as_i64) != Some(INITIALIZE_SEQ) {
            return Ok(false);
        }
        let body = response_result(message)
            .map_err(|error| format!("{adapter} rejected initialize: {error}"))?;
        filters = exception_filters_from(&body);
        Ok(true)
    })?;
    Ok(filters)
}

/// The `attach` arguments: the pid under both spellings, and no stop on entry.
///
/// The DAP spec names the field `processId`; lldb-dap has also accepted `pid`, so both are sent
/// and the adapter takes the one it knows.
fn attach_arguments(pid: u32) -> Value {
    json!({
        "pid": pid,
        "processId": pid,
        "stopOnEntry": false,
    })
}

/// The name the adapter reports for a process, when it reports one.
fn process_name_from(body: Option<&Value>) -> Option<String> {
    body.and_then(|body| body.get("name"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// The process path the adapter reported, or an empty string when it reported only a name.
///
/// lldb-dap names the attached executable without a directory, so this is normally empty.
fn program_path(name: Option<&str>) -> String {
    match name {
        Some(name) if name.contains('/') => name.to_string(),
        _ => String::new(),
    }
}

/// Read frames until `check` says the handshake step is done, answering server requests on the way.
fn pump_until<F>(
    pipe: &mut ProcessPipe,
    adapter: &str,
    what: &str,
    reverse_seq: &mut i64,
    mut check: F,
) -> Result<(), String>
where
    F: FnMut(&Value) -> Result<bool, String>,
{
    let deadline = Instant::now() + REQUEST_TIMEOUT;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(format!(
                "{adapter} did not answer {what} within {}s",
                REQUEST_TIMEOUT.as_secs()
            ));
        }

        match pipe.frames.recv_timeout(remaining) {
            Ok(Ok(message)) => {
                if message.get("type").and_then(Value::as_str) == Some("request") {
                    let response = server_response(*reverse_seq, &message);
                    *reverse_seq += 1;
                    let _ = pipe.send(&response);
                    continue;
                }
                if check(&message)? {
                    return Ok(());
                }
            }
            Ok(Err(error)) => {
                return Err(format!(
                    "{adapter} stopped before it could answer {what}: {error}"
                ));
            }
            Err(RecvTimeoutError::Timeout) => {
                return Err(format!(
                    "{adapter} did not answer {what} within {}s",
                    REQUEST_TIMEOUT.as_secs()
                ));
            }
            Err(RecvTimeoutError::Disconnected) => {
                return Err(format!("{adapter} exited before it could answer {what}"));
            }
        }
    }
}

/// The only place a poisoned lock is recovered: a panicking pump thread must not turn every later
/// command into an error.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poison| poison.into_inner())
}

fn session_for(state: &DapState, id: &str) -> Result<Arc<Session>, String> {
    lock(&state.sessions)
        .get(id)
        .cloned()
        .ok_or_else(|| format!("no debug session {id}"))
}

/// A response's body, or the adapter's own message when it failed.
fn response_result(message: &Value) -> Result<Value, String> {
    if message
        .get("success")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Ok(message.get("body").cloned().unwrap_or(Value::Null));
    }

    Err(message
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("no message")
        .to_string())
}

/// A response to an adapter-initiated request: acknowledged with a null body.
fn server_response(seq: i64, request: &Value) -> Value {
    json!({
        "seq": seq,
        "type": "response",
        "request_seq": request.get("seq").cloned().unwrap_or(Value::Null),
        "success": true,
        "command": request.get("command").cloned().unwrap_or(Value::Null),
        "body": Value::Null,
    })
}

fn emit_stopped(app: &AppHandle, payload: DapStoppedEvent) {
    let _ = app.emit("dap://stopped", payload);
}

fn emit_terminated(app: &AppHandle, session: &str) {
    let _ = app.emit("dap://terminated", json!({ "session": session }));
}

/// The `stopped` body plus the location the pump looked up for it.
fn stopped_event(
    session: &str,
    body: &Value,
    source: Option<String>,
    line: Option<u32>,
) -> DapStoppedEvent {
    DapStoppedEvent {
        session: session.to_string(),
        reason: body
            .get("reason")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string(),
        description: body
            .get("description")
            .and_then(Value::as_str)
            .map(str::to_string),
        thread_id: body
            .get("threadId")
            .and_then(Value::as_u64)
            .map(|id| id as u32),
        line,
        source,
    }
}

/// The DAP command for a step kind, rejecting anything the UI might invent.
fn step_command(kind: &str) -> Result<&'static str, String> {
    match kind {
        "next" => Ok("next"),
        "stepIn" => Ok("stepIn"),
        "stepOut" => Ok("stepOut"),
        other => Err(format!(
            "unknown step kind {other:?}: expected next, stepIn or stepOut"
        )),
    }
}

fn entries(body: &Value, key: &str) -> Vec<Value> {
    body.get(key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn breakpoints_from(body: &Value) -> Vec<DapBreakpoint> {
    entries(body, "breakpoints")
        .iter()
        .map(|entry| DapBreakpoint {
            id: entry.get("id").and_then(Value::as_u64).map(|id| id as u32),
            verified: entry
                .get("verified")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            line: entry
                .get("line")
                .and_then(Value::as_u64)
                .map(|line| line as u32),
            message: entry
                .get("message")
                .and_then(Value::as_str)
                .map(str::to_string),
            source: entry
                .get("source")
                .and_then(|source| source.get("path"))
                .and_then(Value::as_str)
                .map(str::to_string),
        })
        .collect()
}

fn threads_from(body: &Value) -> Vec<DapThread> {
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

fn frames_from(body: &Value) -> Vec<DapFrame> {
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

fn scopes_from(body: &Value) -> Vec<DapScope> {
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

fn variables_from(body: &Value) -> Vec<DapVariable> {
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

fn instructions_from(body: &Value) -> Vec<DisassembledInstruction> {
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

fn data_breakpoint_info_from(body: &Value) -> DataBreakpointInfo {
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
fn base64_encode(bytes: &[u8]) -> String {
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
fn base64_decode(text: &str) -> Result<Vec<u8>, String> {
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
fn resolve_adapter() -> Result<String, String> {
    if let Some(found) = resolve::resolve(ADAPTER) {
        return Ok(found.path.to_string_lossy().into_owned());
    }

    Err(format!(
        "{ADAPTER} not found on PATH or through xcrun; install the Xcode command line tools with \
         `xcode-select --install`"
    ))
}

/// The directory's real path, with every symlink resolved.
fn real_directory(path: &str) -> Result<String, String> {
    let resolved = fs::canonicalize(path)
        .map_err(|error| format!("cannot resolve the launch directory {path}: {error}"))?;

    Ok(resolved.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_decodes_with_padding() {
        assert_eq!(base64_decode("cXVhcnJ5").expect("decode"), b"quarry");
        assert_eq!(base64_decode("").expect("decode"), Vec::<u8>::new());
        assert_eq!(
            base64_decode("3q2+7wARIjM=").expect("decode"),
            vec![0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33]
        );
        assert_eq!(base64_decode("AA==").expect("decode"), vec![0x00]);
        assert_eq!(base64_decode("AAE=").expect("decode"), vec![0x00, 0x01]);
    }

    #[test]
    fn base64_decodes_without_padding() {
        // The adapter pads, but a reader that refuses an unpadded tail is a latent defect.
        assert_eq!(
            base64_decode("3q2+7wARIjM").expect("decode"),
            vec![0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33]
        );
        assert_eq!(base64_decode("AAE").expect("decode"), vec![0x00, 0x01]);
        assert_eq!(base64_decode("AA").expect("decode"), vec![0x00]);
    }

    #[test]
    fn base64_rejects_a_stray_character() {
        let error = base64_decode("3q2*7w==").expect_err("stray character");
        assert!(error.contains("invalid base64"), "message: {error}");
    }

    #[test]
    fn stopped_event_maps_the_body_and_a_known_location() {
        let body = json!({
            "reason": "breakpoint",
            "threadId": 7,
            "description": "watchpoint 1",
        });

        let event = stopped_event("dap-1", &body, Some("/p/src/main.rs".to_string()), Some(12));
        assert_eq!(event.session, "dap-1");
        assert_eq!(event.reason, "breakpoint");
        assert_eq!(event.description.as_deref(), Some("watchpoint 1"));
        assert_eq!(event.thread_id, Some(7));
        assert_eq!(event.source.as_deref(), Some("/p/src/main.rs"));
        assert_eq!(event.line, Some(12));
    }

    #[test]
    fn stopped_event_tolerates_a_missing_location_and_body() {
        let event = stopped_event("dap-2", &json!({}), None, None);
        assert_eq!(event.session, "dap-2");
        assert_eq!(event.reason, "unknown");
        assert_eq!(event.description, None);
        assert_eq!(event.thread_id, None);
        assert_eq!(event.source, None);
        assert_eq!(event.line, None);
    }

    #[test]
    fn breakpoint_response_maps_ids_verified_flags_lines_and_source() {
        let body = json!({
            "breakpoints": [
                {
                    "id": 3,
                    "verified": true,
                    "line": 12,
                    "source": { "path": "/p/src/main.rs" },
                },
                { "verified": false, "line": 40, "message": "pending" },
            ],
        });

        let mapped = breakpoints_from(&body);
        assert_eq!(mapped.len(), 2);

        assert_eq!(mapped[0].id, Some(3));
        assert!(mapped[0].verified);
        assert_eq!(mapped[0].line, Some(12));
        assert_eq!(mapped[0].source.as_deref(), Some("/p/src/main.rs"));
        assert_eq!(mapped[0].message, None);

        assert_eq!(mapped[1].id, None);
        assert!(!mapped[1].verified);
        assert_eq!(mapped[1].line, Some(40));
        assert_eq!(mapped[1].message.as_deref(), Some("pending"));

        assert!(breakpoints_from(&json!({})).is_empty());
    }

    #[test]
    fn step_kinds_are_whitelisted() {
        for kind in ["next", "stepIn", "stepOut"] {
            let command = step_command(kind).expect("accepted step kind");
            assert_eq!(command, kind);
        }

        let error = step_command("stepOver").expect_err("unknown step kind");
        assert!(error.contains("stepOver"), "message: {error}");
        assert!(error.contains("next"), "message: {error}");
        assert!(step_command("").is_err());
    }

    #[test]
    fn data_breakpoint_info_keeps_the_dataid_shape() {
        let info = data_breakpoint_info_from(&json!({
            "dataId": "16FDFDCBC/4",
            "description": "4 bytes at 16FDFDCBC n",
            "accessTypes": ["read", "write", "readWrite"],
        }));

        assert_eq!(info.data_id.as_deref(), Some("16FDFDCBC/4"));
        assert_eq!(info.description, "4 bytes at 16FDFDCBC n");
        assert_eq!(info.access_types, vec!["read", "write", "readWrite"]);
    }

    #[test]
    fn breakpoint_specs_map_to_dap_source_breakpoints() {
        let specs = vec![
            BreakpointSpec {
                line: 12,
                ..Default::default()
            },
            BreakpointSpec {
                line: 20,
                condition: Some("n == 4".to_string()),
                hit_condition: Some("> 2".to_string()),
                ..Default::default()
            },
            BreakpointSpec {
                line: 30,
                log_message: Some("n={n}".to_string()),
                ..Default::default()
            },
            BreakpointSpec {
                line: 40,
                condition: Some("never".to_string()),
                enabled: false,
                ..Default::default()
            },
        ];

        let mapped = source_breakpoints(&specs);

        // The disabled one is not sent at all, so the adapter stops holding it.
        assert_eq!(mapped.len(), 3);
        assert_eq!(mapped[0], json!({ "line": 12 }));
        assert_eq!(
            mapped[1],
            json!({ "line": 20, "condition": "n == 4", "hitCondition": "> 2" })
        );
        assert_eq!(mapped[2], json!({ "line": 30, "logMessage": "n={n}" }));
    }

    #[test]
    fn a_breakpoint_spec_is_enabled_unless_it_says_otherwise() {
        assert!(BreakpointSpec::default().enabled);
        assert!(
            BreakpointSpec {
                line: 3,
                ..Default::default()
            }
            .enabled
        );
    }

    #[test]
    fn exception_filters_parse_two_with_defaults_and_missing_label() {
        let body = json!({
            "exceptionBreakpointFilters": [
                { "filter": "uncaught", "label": "Uncaught Exceptions", "default": true },
                { "filter": "caught" },
            ],
        });
        let parsed = exception_filters_from(&body);
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].filter, "uncaught");
        assert_eq!(parsed[0].label, "Uncaught Exceptions");
        assert!(parsed[0].default);
        assert_eq!(parsed[1].filter, "caught");
        assert_eq!(parsed[1].label, "caught");
        assert!(!parsed[1].default);
    }

    #[test]
    fn exception_filters_empty_array_yields_empty() {
        let body = json!({ "exceptionBreakpointFilters": [] });
        assert!(exception_filters_from(&body).is_empty());
        assert!(exception_filters_from(&json!({})).is_empty());
    }

    #[test]
    fn exception_filters_skip_malformed_entries() {
        let body = json!({
            "exceptionBreakpointFilters": [
                { "label": "no filter" },
                42,
                { "filter": "all", "label": "All", "default": "yes" },
            ],
        });
        let parsed = exception_filters_from(&body);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].filter, "all");
        assert!(!parsed[0].default);
    }

    #[test]
    fn unknown_session_error_names_it() {
        let state = DapState::default();
        let error = session_for(&state, "dap-99").expect_err("unknown session");
        assert!(error.contains("dap-99"), "message: {error}");
    }

    #[test]
    fn attach_arguments_name_the_pid_and_do_not_stop_on_entry() {
        let arguments = attach_arguments(4242);

        assert_eq!(arguments["pid"], json!(4242));
        assert_eq!(arguments["processId"], json!(4242));
        assert_eq!(arguments["stopOnEntry"], json!(false));
    }

    #[test]
    fn an_explicit_thread_wins_over_the_recorded_one() {
        assert_eq!(select_thread(Some(9), 3), 9);
        assert_eq!(select_thread(None, 3), 3);
        assert_eq!(select_thread(None, 0), 0);
    }

    #[test]
    fn the_program_path_is_empty_when_the_adapter_names_no_path() {
        assert_eq!(program_path(Some("dap_spike")), "");
        assert_eq!(program_path(Some("/tmp/dap_spike")), "/tmp/dap_spike");
        assert_eq!(program_path(None), "");
    }

    #[test]
    fn base64_encode_round_trips_small_inputs() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        let bytes: Vec<u8> = (0..16).collect();
        assert_eq!(base64_encode(&bytes), "AAECAwQFBgcICQoLDA0ODw==");
    }

    #[test]
    fn set_variable_arguments_carry_name_and_value() {
        let arguments = set_variable_arguments(7, "n", "42");
        assert_eq!(arguments["variablesReference"], json!(7));
        assert_eq!(arguments["name"], json!("n"));
        assert_eq!(arguments["value"], json!("42"));
    }

    #[test]
    fn set_variable_rejects_empty_name() {
        let error = validate_set_variable("", "42").expect_err("empty name");
        assert!(error.contains("name"), "message: {error}");
        assert!(error.contains("empty"), "message: {error}");
    }

    #[test]
    fn set_variable_rejects_empty_value() {
        let error = validate_set_variable("n", "").expect_err("empty value");
        assert!(error.contains("value"), "message: {error}");
        assert!(error.contains("empty"), "message: {error}");
    }

    #[test]
    fn set_variable_result_requires_a_value_string() {
        assert!(set_variable_result(&json!({ "value": "42" })).is_ok());
        let error = set_variable_result(&json!({ "type": "int" })).expect_err("no value");
        assert!(error.contains("no value"), "message: {error}");
    }

    #[test]
    fn exception_breakpoint_arguments_carry_two_filters() {
        let arguments =
            exception_breakpoints_arguments(&["uncaught".to_string(), "thrown".to_string()]);
        assert_eq!(arguments["filters"], json!(["uncaught", "thrown"]));
    }

    #[test]
    fn exception_breakpoint_arguments_allow_an_empty_list() {
        let arguments = exception_breakpoints_arguments(&[]);
        assert_eq!(arguments["filters"], json!([]));
    }

    #[test]
    fn exception_filters_round_trip_through_the_session() {
        let mut command = Command::new("/bin/cat");
        let pipe = ProcessPipe::spawn(&mut command).expect("spawn /bin/cat");
        let session = Session::new("dap-rt".to_string(), pipe);

        assert!(lock(&session.exception_filters).is_empty());
        *lock(&session.exception_filters) = vec!["uncaught".to_string()];
        assert_eq!(
            lock(&session.exception_filters).clone(),
            vec!["uncaught".to_string()]
        );
    }

    #[test]
    fn write_memory_arguments_keep_the_address_shape() {
        let prefixed = write_memory_arguments("0x1000", &[0xde, 0xad]);
        assert_eq!(prefixed["memoryReference"], json!("0x1000"));
        assert_eq!(prefixed["data"], json!("3q0="));
        assert_eq!(prefixed["offset"], json!(0));

        let unprefixed = write_memory_arguments("16FDFDCBC", &[0xde, 0xad]);
        assert_eq!(unprefixed["memoryReference"], json!("16FDFDCBC"));
    }
}

/// Write bytes into the debuggee's memory. `bytes` arrive as raw values from the memory pane.
#[tauri::command]
pub async fn dap_write_memory(
    state: State<'_, DapState>,
    session: String,
    address: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    if bytes.is_empty() {
        return Err("writeMemory: `bytes` must not be empty".to_string());
    }

    let arguments = write_memory_arguments(&address, &bytes);

    session_for(&state, &session)?
        .request("writeMemory", arguments)
        .map(|_| ())
}

/// Build the `writeMemory` request arguments for `address` and `bytes`.
///
/// The address is passed through unchanged: prefixed addresses keep their `0x` and the adapter's
/// unprefixed `dataId`-shaped addresses are accepted as-is.
fn write_memory_arguments(address: &str, bytes: &[u8]) -> Value {
    json!({
        "memoryReference": address,
        "data": base64_encode(bytes),
        "offset": 0,
    })
}

/// Change a variable's value in the debuggee (DAP `setVariable`).
fn validate_set_variable(name: &str, value: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("setVariable: `name` must not be empty".to_string());
    }
    if value.is_empty() {
        return Err("setVariable: `value` must not be empty".to_string());
    }
    Ok(())
}

fn set_variable_arguments(variables_reference: u32, name: &str, value: &str) -> Value {
    json!({
        "variablesReference": variables_reference,
        "name": name,
        "value": value,
    })
}

fn set_variable_result(body: &Value) -> Result<(), String> {
    if body.get("value").and_then(Value::as_str).is_some() {
        Ok(())
    } else {
        Err("setVariable: the adapter returned no value".to_string())
    }
}

#[tauri::command]
pub async fn dap_set_variable(
    state: State<'_, DapState>,
    session: String,
    variables_reference: u32,
    name: String,
    value: String,
) -> Result<(), String> {
    validate_set_variable(&name, &value)?;

    let arguments = set_variable_arguments(variables_reference, &name, &value);

    let body = session_for(&state, &session)?.request("setVariable", arguments)?;
    set_variable_result(&body)
}

/// Enable exception-style breakpoints. Filters come from the adapter's own `exceptionBreakpointFilters`.
///
/// An empty list is valid and clears them. The last filters are kept on the session so `dap_restart`
/// can re-apply them after relaunch.
#[tauri::command]
pub async fn dap_set_exception_breakpoints(
    state: State<'_, DapState>,
    session: String,
    filters: Vec<String>,
) -> Result<(), String> {
    let session = session_for(&state, &session)?;
    let arguments = exception_breakpoints_arguments(&filters);
    session.request("setExceptionBreakpoints", arguments)?;
    *lock(&session.exception_filters) = filters;
    Ok(())
}

/// Build the DAP arguments for `setExceptionBreakpoints`.
fn exception_breakpoints_arguments(filters: &[String]) -> Value {
    json!({ "filters": filters })
}

/// The adapter's own exception-breakpoint filters, captured from `initialize`.
#[tauri::command]
pub async fn dap_exception_filters(
    state: State<'_, DapState>,
    session: String,
) -> Result<Vec<ExceptionFilter>, String> {
    let session = session_for(&state, &session)?;
    Ok(lock(&session.exception_breakpoint_filters).clone())
}

/// Parse `exceptionBreakpointFilters` from an `initialize` response body.
fn exception_filters_from(body: &Value) -> Vec<ExceptionFilter> {
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
