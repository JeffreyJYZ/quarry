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
pub mod tests_group_8 {
    use super::*;

    /// The Windows row's first adapter launch: no answer, and the app said nothing about why. A
    /// failure that carries the status and the adapter's own words is the whole fix.
    #[test]
    pub fn a_startup_death_carries_the_status_and_the_adapters_words() {
        let message = format_start_failure(
            r"C:\Program Files\LLVM\bin\lldb-dap.exe",
            "did not answer initialize within 20s",
            "error: liblldb.dll not found\n",
            Some(53),
        );

        assert!(message.contains("lldb-dap.exe"));
        assert!(message.contains("did not answer initialize"));
        assert!(message.contains("exit code 53, 0x35"));
        assert!(message.contains("it said: error: liblldb.dll not found"));
    }

    /// A loader failure is the one startup death that prints nothing at all, so the message has to
    /// say that rather than leave an empty tail looking like a swallowed error.
    #[test]
    pub fn a_silent_death_says_it_printed_nothing() {
        let message = format_start_failure("lldb-dap", "did not answer launch", "", Some(1));
        assert!(message.ends_with("it printed nothing"));
    }

    /// A timeout with a live adapter has no status to report, and nothing is invented for it.
    #[test]
    pub fn a_timeout_with_no_status_names_no_exit() {
        let message = format_start_failure("lldb-dap", "did not answer launch", "", None);
        assert_eq!(message, "lldb-dap: did not answer launch");
    }

    /// The statuses a Windows loader leaves when it could not start a program at all.
    #[test]
    pub fn loader_statuses_are_named() {
        for code in [0xc000_0135u32, 0xc000_0139, 0xc000_0142, 0xc000_0005] {
            assert!(exit_hint(code).is_some(), "0x{code:x} has no hint");
        }
        assert!(exit_hint(53).is_none(), "a bare 53 is not a loader status");
        assert_eq!(describe_exit(53), "53, 0x35");
    }

    /// A status arrives as a signed `i32`, so the high-bit statuses have to print as one word.
    #[test]
    pub fn a_high_bit_status_keeps_its_hex_word() {
        let status = 0xc000_0135u32 as i32;
        let described = describe_exit(status);
        assert!(described.contains("0xc0000135"), "{described}");
        assert!(described.contains("could not find a DLL"), "{described}");
    }

    /// The failure is one line: a message with newlines breaks the log line it is printed on.
    #[test]
    pub fn the_message_is_one_line() {
        let message = format_start_failure(
            "lldb-dap",
            "died",
            "line one\nline two\nline three\n",
            Some(1),
        );
        assert!(!message.contains('\n'), "{message}");
        assert!(message.contains("line one"));
    }
}
