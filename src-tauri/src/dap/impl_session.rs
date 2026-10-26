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

/// A live adapter process plus the correlation state its pump resolves.
pub struct Session {
    pub(crate) id: String,
    /// `None` once [`Session::shutdown`] has taken the child; `ProcessPipe`'s own `Drop` reaps it.
    pub(crate) pipe: Mutex<Option<ProcessPipe>>,
    /// Outstanding requests, keyed by the `seq` they were sent with.
    pub(crate) pending: Mutex<HashMap<i64, Sender<Result<Value, String>>>>,
    pub(crate) seq: AtomicI64,
    /// The thread id of the last `stopped` event, which `continue` and the step commands need.
    pub(crate) stopped_thread: AtomicU32,
    pub(crate) alive: AtomicBool,
    /// The launch parameters this session was created with, so a restart can relaunch identically.
    /// `None` for sessions created by `dap_attach`.
    pub launch_config: Option<LaunchConfig>,
    /// The last exception-breakpoint filters sent, so `dap_restart` can re-apply them.
    pub exception_filters: Mutex<Vec<String>>,
    /// The adapter's exception-breakpoint filters, captured during `initialize`.
    pub exception_breakpoint_filters: Mutex<Vec<ExceptionFilter>>,
}
impl Session {
    pub(crate) fn new(id: String, pipe: ProcessPipe) -> Self {
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

    pub(crate) fn next_seq(&self) -> i64 {
        self.seq.fetch_add(1, Ordering::SeqCst)
    }

    pub(crate) fn write(&self, message: &Value) -> io::Result<()> {
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
    pub(crate) fn request(&self, command: &str, arguments: Value) -> Result<Value, String> {
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
                lock(&self.pending).remove(&seq);
                Err(format!("{command}: {ADAPTER} stopped answering"))
            }
        }
    }

    /// Hand a response to the request that is waiting on it. `false` when nothing was waiting.
    pub(crate) fn resolve(&self, message: &Value) -> bool {
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
    pub(crate) fn fail_pending(&self, reason: &str) {
        let pending = std::mem::take(&mut *lock(&self.pending));
        for (_, sender) in pending {
            let _ = sender.send(Err(reason.to_string()));
        }
    }

    /// Say goodbye, kill and reap the child, and fail anything still waiting. Idempotent.
    pub(crate) fn shutdown(&self) {
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
