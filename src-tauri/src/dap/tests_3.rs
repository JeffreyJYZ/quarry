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
pub mod tests_group_3 {
    use super::*;

    #[test]
    pub fn base64_encode_round_trips_small_inputs() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        let bytes: Vec<u8> = (0..16).collect();
        assert_eq!(base64_encode(&bytes), "AAECAwQFBgcICQoLDA0ODw==");
    }

    #[test]
    pub fn set_variable_arguments_carry_name_and_value() {
        let arguments = set_variable_arguments(7, "n", "42");
        assert_eq!(arguments["variablesReference"], json!(7));
        assert_eq!(arguments["name"], json!("n"));
        assert_eq!(arguments["value"], json!("42"));
    }

    #[test]
    pub fn set_variable_rejects_empty_name() {
        let error = validate_set_variable("", "42").expect_err("empty name");
        assert!(error.contains("name"), "message: {error}");
        assert!(error.contains("empty"), "message: {error}");
    }

    #[test]
    pub fn set_variable_rejects_empty_value() {
        let error = validate_set_variable("n", "").expect_err("empty value");
        assert!(error.contains("value"), "message: {error}");
        assert!(error.contains("empty"), "message: {error}");
    }

    #[test]
    pub fn set_variable_result_requires_a_value_string() {
        assert!(set_variable_result(&json!({ "value": "42" })).is_ok());
        let error = set_variable_result(&json!({ "type": "int" })).expect_err("no value");
        assert!(error.contains("no value"), "message: {error}");
    }

    #[test]
    pub fn exception_breakpoint_arguments_carry_two_filters() {
        let arguments =
            exception_breakpoints_arguments(&["uncaught".to_string(), "thrown".to_string()]);
        assert_eq!(arguments["filters"], json!(["uncaught", "thrown"]));
    }

    #[test]
    pub fn exception_breakpoint_arguments_allow_an_empty_list() {
        let arguments = exception_breakpoints_arguments(&[]);
        assert_eq!(arguments["filters"], json!([]));
    }

    #[test]
    pub fn exception_filters_round_trip_through_the_session() {
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
    pub fn write_memory_arguments_keep_the_address_shape() {
        let prefixed = write_memory_arguments("0x1000", &[0xde, 0xad]);
        assert_eq!(prefixed["memoryReference"], json!("0x1000"));
        assert_eq!(prefixed["data"], json!("3q0="));
        assert_eq!(prefixed["offset"], json!(0));

        let unprefixed = write_memory_arguments("16FDFDCBC", &[0xde, 0xad]);
        assert_eq!(unprefixed["memoryReference"], json!("16FDFDCBC"));
    }
}
