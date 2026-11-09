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

/// How long a cooperating adapter gets to act on `disconnect` before it is killed.
///
/// `disconnect` with `terminateDebuggee` is what makes lldb-dap kill the inferior; killing the pipe
/// first leaves the debuggee running, so the goodbye gets a short, bounded window.
pub const DISCONNECT_GRACE: Duration = Duration::from_secs(2);

impl Session {
    /// Say goodbye, wait for the adapter to act on it, then kill and reap. Idempotent.
    ///
    /// `true` means the adapter ignored the disconnect and had to be killed.
    pub(crate) fn shutdown(&self) -> bool {
        self.shutdown_with_grace(DISCONNECT_GRACE)
    }

    /// [`Session::shutdown`] with an explicit window, so a test need not wait the full grace.
    pub(crate) fn shutdown_with_grace(&self, grace: Duration) -> bool {
        if self.alive.swap(false, Ordering::SeqCst) {
            let _ = self.write(&json!({
                "seq": self.next_seq(),
                "type": "request",
                "command": "disconnect",
                "arguments": { "terminateDebuggee": true, "restart": false },
            }));
        }

        let pipe = lock(&self.pipe).take();
        let escalated = match pipe {
            Some(mut pipe) => {
                if pipe.wait_exit(grace) {
                    false
                } else {
                    let _ = pipe.kill();
                    true
                }
            }
            None => false,
        };
        self.fail_pending("the debug session is closed");
        escalated
    }
}
