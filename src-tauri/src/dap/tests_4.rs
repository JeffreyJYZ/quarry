#![allow(unused_imports)]

pub(crate) use crate::protocol_pipe::{FrameError, ProcessPipe};
pub(crate) use crate::resolve;
pub(crate) use crate::types::{
    BreakpointSpec, DapBreakpoint, DapEvaluation, DapFrame, DapScope, DapSession, DapStoppedEvent,
    DapThread, DapVariable, DataBreakpointInfo, DisassembledInstruction, ExceptionFilter,
    LaunchConfig, MemoryDump,
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
pub mod tests_group_4 {
    use super::*;

    #[test]
    pub fn evaluate_defaults_to_the_measured_context() {
        assert_eq!(evaluate_context(None), Ok("watch"));
        assert_eq!(evaluate_context(Some("repl")), Ok("repl"));
        assert_eq!(evaluate_context(Some("variables")), Ok("variables"));
    }

    #[test]
    pub fn evaluate_rejects_an_unknown_context_by_name() {
        let error = evaluate_context(Some("expression")).unwrap_err();
        assert!(error.contains("\"expression\""), "{error}");
        assert!(error.contains("watch"), "{error}");
    }

    #[test]
    pub fn evaluate_arguments_omit_an_absent_frame_id() {
        let arguments = evaluate_arguments("a + b", None, None).unwrap();
        assert_eq!(arguments["expression"], json!("a + b"));
        assert_eq!(arguments["context"], json!("watch"));
        assert!(
            arguments.get("frameId").is_none(),
            "frameId must be absent, not null"
        );
    }

    #[test]
    pub fn evaluate_arguments_carry_a_present_frame_id() {
        let arguments = evaluate_arguments("n", Some(1000), Some("watch")).unwrap();
        assert_eq!(arguments["frameId"], json!(1000));
    }

    #[test]
    pub fn evaluate_arguments_reject_an_empty_expression() {
        let error = evaluate_arguments("", Some(1), None).unwrap_err();
        assert!(error.contains("must not be empty"), "{error}");
    }

    #[test]
    pub fn evaluation_from_reads_result_type_and_reference() {
        let body = json!({
            "result": "\"quarry\"",
            "type": "alloc::string::String",
            "variablesReference": 7,
        });
        let evaluation = evaluation_from(&body).unwrap();
        assert_eq!(evaluation.result, "\"quarry\"");
        assert_eq!(
            evaluation.type_name.as_deref(),
            Some("alloc::string::String")
        );
        assert_eq!(evaluation.variables_reference, 7);
    }

    #[test]
    pub fn evaluation_from_defaults_type_and_reference() {
        let evaluation = evaluation_from(&json!({ "result": "2" })).unwrap();
        assert_eq!(evaluation.type_name, None);
        assert_eq!(evaluation.variables_reference, 0);
    }

    #[test]
    pub fn evaluation_from_rejects_a_body_without_a_result() {
        let error = evaluation_from(&json!({ "type": "int" })).unwrap_err();
        assert!(error.contains("no result"), "{error}");
    }
}
