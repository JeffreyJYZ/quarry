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

/// Read frames off the adapter and keep both sides unblocked.
pub struct Pump {
    pub(crate) app: AppHandle,
    pub(crate) session: Arc<Session>,
    pub(crate) frames: Receiver<Result<Value, FrameError>>,
    /// Messages seen while a stop was being enriched; replayed in order afterwards.
    pub(crate) deferred: Vec<Value>,
    /// Set while the pump issues a request of its own, which must never nest another one.
    pub(crate) depth: u8,
}
impl Pump {
    pub fn run(mut self) {
        while let Some(message) = self.next() {
            self.handle(message);
        }

        self.session.fail_pending(&format!("{ADAPTER} stopped"));
        self.session.alive.store(false, Ordering::SeqCst);
    }

    pub fn next(&mut self) -> Option<Value> {
        if !self.deferred.is_empty() {
            return Some(self.deferred.remove(0));
        }

        match self.frames.recv() {
            Ok(Ok(value)) => Some(value),
            // A framing error is the end of the stream, exactly like a closed channel.
            Ok(Err(_)) | Err(_) => None,
        }
    }

    pub fn handle(&mut self, message: Value) {
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

    pub fn event(&mut self, message: &Value) {
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
    pub fn top_frame(&mut self, body: &Value) -> (Option<String>, Option<u32>) {
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
    pub fn request(&mut self, command: &str, arguments: Value) -> Option<Value> {
        if self.depth > 0 {
            return None;
        }

        self.depth += 1;
        let result = self.request_inner(command, arguments);
        self.depth -= 1;
        result
    }

    pub fn request_inner(&mut self, command: &str, arguments: Value) -> Option<Value> {
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
                        return response_result(&value).ok();
                    }
                    self.deferred.push(value);
                }
                Ok(Err(_)) | Err(_) => return None,
            }
        }
    }
}
