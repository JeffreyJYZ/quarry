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

/// The adapter this crate supports; resolved through `PATH` and then `xcrun`.
pub const ADAPTER: &str = "lldb-dap";

/// Every request is bounded: a hung adapter fails the command instead of freezing the UI.
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

/// Fixed ids for the two handshake requests; anything a session sends starts above them.
pub const INITIALIZE_SEQ: i64 = 1;

/// The second request of a handshake: `launch` or `attach`, never both in one session.
pub const SESSION_SEQ: i64 = 2;

pub const FIRST_REQUEST_SEQ: i64 = 3;

/// Held by Tauri as managed state: one live session per generated id.
#[derive(Default)]
pub struct DapState {
    pub sessions: Mutex<HashMap<String, Arc<Session>>>,
    /// Only ever incremented, so an id is never reused while a stale session is still draining.
    pub(crate) counter: AtomicU64,
}
