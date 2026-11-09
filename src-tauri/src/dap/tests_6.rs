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

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_6 {
    use super::*;

    /// A stand-in adapter: only the process lifecycle matters to these tests, not the protocol.
    #[cfg(unix)]
    fn fake_adapter(script: &str) -> ProcessPipe {
        let mut command = Command::new("/bin/sh");
        command.arg("-c").arg(script);
        ProcessPipe::spawn(&mut command).expect("spawn the fake adapter")
    }

    fn launch_config() -> LaunchConfig {
        LaunchConfig {
            program: "/bin/true".to_string(),
            args: Vec::new(),
            cwd: "/tmp".to_string(),
            stop_on_entry: false,
            init_commands: Vec::new(),
        }
    }

    #[cfg(unix)]
    #[test]
    pub fn shutdown_waits_for_an_adapter_that_honours_disconnect() {
        // Reads the framed request off stdin, then exits exactly as lldb-dap would.
        let session = Session::new(
            "dap-1".to_string(),
            fake_adapter("IFS= read -r line; exit 0"),
        );
        assert!(
            !session.shutdown_with_grace(Duration::from_secs(2)),
            "a cooperating adapter must exit on its own, not be hard-killed"
        );
    }

    #[cfg(unix)]
    #[test]
    pub fn shutdown_hard_kills_an_adapter_that_ignores_disconnect() {
        let session = Session::new("dap-2".to_string(), fake_adapter("exec sleep 30"));
        let started = Instant::now();
        assert!(
            session.shutdown_with_grace(Duration::from_millis(120)),
            "an adapter that never exits must be killed on timeout"
        );
        assert!(
            started.elapsed() < Duration::from_secs(2),
            "the timeout bounds the wait: {:?}",
            started.elapsed()
        );
    }

    #[cfg(unix)]
    #[test]
    pub fn a_failed_restart_leaves_the_old_session_addressable() {
        let state = DapState::default();
        let mut old = Session::new("dap-1".to_string(), fake_adapter("exit 0"));
        old.launch_config = Some(launch_config());
        lock(&state.sessions).insert("dap-1".to_string(), Arc::new(old));

        let (source, config, _) = restart_source(&state, "dap-1").expect("the old session");
        assert_eq!(source.id, "dap-1");
        assert_eq!(config.program, "/bin/true");

        // The relaunch failed before `retire_session`, so the old id still resolves.
        assert!(
            session_for(&state, "dap-1").is_ok(),
            "the old id must stay addressable after a failed relaunch"
        );
    }

    #[cfg(unix)]
    #[test]
    pub fn a_finished_restart_retires_only_the_old_id() {
        let state = DapState::default();
        let old = Session::new("dap-1".to_string(), fake_adapter("exit 0"));
        let new = Session::new("dap-2".to_string(), fake_adapter("exit 0"));
        lock(&state.sessions).insert("dap-1".to_string(), Arc::new(old));
        lock(&state.sessions).insert("dap-2".to_string(), Arc::new(new));

        retire_session(&state, "dap-1");

        assert!(session_for(&state, "dap-1").is_err());
        assert!(session_for(&state, "dap-2").is_ok());
    }

    #[test]
    pub fn continue_with_no_recorded_stop_refuses_instead_of_thread_zero() {
        // The decision `dap_continue` makes before it writes anything: a real adapter is not needed.
        let error = select_thread("continue", None, 0).expect_err("no stop recorded");
        assert!(error.contains("no stopped thread"), "message: {error}");
        assert!(
            select_thread("continue", Some(0), 0).is_err(),
            "zero is not a DAP thread id"
        );
    }
}
