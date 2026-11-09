#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use serde_json::{Value, json};
pub use std::collections::HashMap;
pub use std::io::{self, BufRead, BufReader, ErrorKind, Read};
pub use std::path::{Path, PathBuf};
pub use std::process::{Child, Command, ExitStatus, Stdio};
pub use std::sync::atomic::{AtomicU64, Ordering};
pub use std::sync::{Arc, Mutex, MutexGuard};
pub use std::thread;
pub use std::time::Duration;
pub use tauri::{AppHandle, Emitter, State};

use super::*;

#[cfg(test)]
pub mod tests {
    use crate::run_task::*;

    #[test]
    fn run_ids_count_from_one_and_never_repeat() {
        assert_eq!(run_id(1), "run-1");
        assert_eq!(run_id(41), "run-41");

        let counter = AtomicU64::new(0);
        assert_eq!(next_id(&counter), "run-1");
        assert_eq!(next_id(&counter), "run-2");
        assert_eq!(next_id(&counter), "run-3");
        assert_eq!(counter.load(Ordering::SeqCst), 3);
    }

    #[test]
    fn exit_codes_map_to_a_number_or_null() {
        let exit = Exit {
            code: Some(3),
            signal: None,
        };
        let exited = exited_payload("run-7", 4, exit);

        assert_eq!(exited["runId"], "run-7");
        assert_eq!(exited["seq"], 4);
        assert_eq!(exited["code"], 3);
        assert_eq!(exited["signal"], Value::Null);
    }

    #[test]
    fn a_signalled_exit_carries_the_signal_that_killed_it() {
        let exited = exited_payload("run-7", 5, Exit::from_signal(11));

        assert_eq!(exited["code"], Value::Null);
        assert_eq!(exited["signal"], 11);
        assert!(exited["code"].as_i64().is_none());
    }

    /// A stopped run has neither a code nor a signal, so the panel must not claim exit 0.
    #[test]
    fn a_stopped_run_reports_no_code_and_no_signal() {
        let exited = exited_payload("run-7", 6, Exit::unknown());

        assert_eq!(exited["code"], Value::Null);
        assert_eq!(exited["signal"], Value::Null);
    }

    /// The stop result is the shape the frontend reads, so the field name is part of the contract.
    #[test]
    fn a_stop_says_whether_it_escalated() {
        assert_eq!(
            json!(Stop { escalated: true }),
            json!({ "escalated": true })
        );
        assert!(!Stop::quiet().escalated);
    }

    #[cfg(unix)]
    #[test]
    fn a_killed_child_reports_its_signal_at_the_kernel_level() {
        let mut child = Command::new("/bin/sleep")
            .arg("30")
            .spawn()
            .expect("spawn /bin/sleep");
        child.kill().expect("kill the child");
        let status = child.wait().expect("reap the child");

        let exit = Exit::from_status(status);

        assert_eq!(exit.code, None, "a signalled death has no exit code");
        assert_eq!(exit.signal, Some(9), "SIGKILL");
    }

    #[test]
    fn output_payloads_name_their_stream_and_number_their_row() {
        let chunk = Chunk {
            text: "hello".to_string(),
            more: true,
        };

        let stdout = output_payload("run-1", 1, STDOUT, &chunk);

        assert_eq!(stdout["runId"], "run-1");
        assert_eq!(stdout["seq"], 1);
        assert_eq!(stdout["stream"], "stdout");
        assert_eq!(stdout["line"], "hello");
        assert_eq!(stdout["more"], true);
        assert_eq!(
            output_payload("run-1", 2, STDERR, &chunk)["stream"],
            "stderr"
        );
    }

    #[test]
    fn relative_paths_are_rejected_by_name() {
        let error = validate("target/debug/app", "/tmp").expect_err("relative program");
        assert!(
            error.contains("target/debug/app"),
            "unexpected error: {error}"
        );
        assert!(error.contains("absolute"), "error should say why: {error}");

        let error = validate("/bin/sh", "relative/dir").expect_err("relative cwd");
        assert!(error.contains("relative/dir"), "unexpected error: {error}");
    }

    #[test]
    fn a_missing_program_is_rejected_by_name() {
        let error =
            validate("/nonexistent/quarry-run-target", "/tmp").expect_err("missing program");

        assert!(
            error.contains("/nonexistent/quarry-run-target"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn env_name_validation() {
        assert!(valid_env_name("GOOD_NAME"));
        assert!(!valid_env_name(""));
        assert!(!valid_env_name("bad-name"));
        assert!(!valid_env_name("1BAD"));
    }

    #[test]
    fn env_none_empty_populated() {
        assert!(validate_env(None).unwrap().is_empty());
        assert!(validate_env(Some(vec![])).unwrap().is_empty());
        let v = validate_env(Some(vec![EnvVar {
            name: "X".into(),
            value: "y".into(),
        }]))
        .unwrap();
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].name, "X");
    }
}
