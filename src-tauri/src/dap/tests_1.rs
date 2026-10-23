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

/// The directory's real path, with every symlink resolved.
pub fn real_directory(path: &str) -> Result<String, String> {
    let resolved = fs::canonicalize(path)
        .map_err(|error| format!("cannot resolve the launch directory {path}: {error}"))?;

    Ok(resolved.to_string_lossy().into_owned())
}
#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_1 {
    use super::*;

    #[test]
    pub fn base64_decodes_with_padding() {
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
    pub fn base64_decodes_without_padding() {
        // The adapter pads, but a reader that refuses an unpadded tail is a latent defect.
        assert_eq!(
            base64_decode("3q2+7wARIjM").expect("decode"),
            vec![0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33]
        );
        assert_eq!(base64_decode("AAE").expect("decode"), vec![0x00, 0x01]);
        assert_eq!(base64_decode("AA").expect("decode"), vec![0x00]);
    }

    #[test]
    pub fn base64_rejects_a_stray_character() {
        let error = base64_decode("3q2*7w==").expect_err("stray character");
        assert!(error.contains("invalid base64"), "message: {error}");
    }

    #[test]
    pub fn stopped_event_maps_the_body_and_a_known_location() {
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
    pub fn stopped_event_tolerates_a_missing_location_and_body() {
        let event = stopped_event("dap-2", &json!({}), None, None);
        assert_eq!(event.session, "dap-2");
        assert_eq!(event.reason, "unknown");
        assert_eq!(event.description, None);
        assert_eq!(event.thread_id, None);
        assert_eq!(event.source, None);
        assert_eq!(event.line, None);
    }

    #[test]
    pub fn breakpoint_response_maps_ids_verified_flags_lines_and_source() {
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
    pub fn step_kinds_are_whitelisted() {
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
    pub fn data_breakpoint_info_keeps_the_dataid_shape() {
        let info = data_breakpoint_info_from(&json!({
            "dataId": "16FDFDCBC/4",
            "description": "4 bytes at 16FDFDCBC n",
            "accessTypes": ["read", "write", "readWrite"],
        }));

        assert_eq!(info.data_id.as_deref(), Some("16FDFDCBC/4"));
        assert_eq!(info.description, "4 bytes at 16FDFDCBC n");
        assert_eq!(info.access_types, vec!["read", "write", "readWrite"]);
    }
}
