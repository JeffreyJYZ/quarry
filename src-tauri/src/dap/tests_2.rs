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
pub mod tests_group_2 {
    use super::*;

    #[test]
    pub fn breakpoint_specs_map_to_dap_source_breakpoints() {
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
    pub fn a_breakpoint_spec_is_enabled_unless_it_says_otherwise() {
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
    pub fn exception_filters_parse_two_with_defaults_and_missing_label() {
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
    pub fn exception_filters_empty_array_yields_empty() {
        let body = json!({ "exceptionBreakpointFilters": [] });
        assert!(exception_filters_from(&body).is_empty());
        assert!(exception_filters_from(&json!({})).is_empty());
    }

    #[test]
    pub fn exception_filters_skip_malformed_entries() {
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
    pub fn unknown_session_error_names_it() {
        let state = DapState::default();
        let error = session_for(&state, "dap-99").expect_err("unknown session");
        assert!(error.contains("dap-99"), "message: {error}");
    }

    #[test]
    pub fn attach_arguments_name_the_pid_and_do_not_stop_on_entry() {
        let arguments = attach_arguments(4242);

        assert_eq!(arguments["pid"], json!(4242));
        assert_eq!(arguments["processId"], json!(4242));
        assert_eq!(arguments["stopOnEntry"], json!(false));
    }

    #[test]
    pub fn an_explicit_thread_wins_over_the_recorded_one() {
        assert_eq!(select_thread(Some(9), 3), 9);
        assert_eq!(select_thread(None, 3), 3);
        assert_eq!(select_thread(None, 0), 0);
    }

    #[test]
    pub fn the_program_path_is_empty_when_the_adapter_names_no_path() {
        assert_eq!(program_path(Some("dap_spike")), "");
        assert_eq!(program_path(Some("/tmp/dap_spike")), "/tmp/dap_spike");
        assert_eq!(program_path(None), "");
    }
}
