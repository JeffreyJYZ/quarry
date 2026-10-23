#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use serde_json::{Value, json};
pub use std::collections::HashMap;
pub use std::io::{self, BufRead, BufReader, ErrorKind, Read};
pub use std::path::{Path, PathBuf};
pub use std::process::{Child, Command, Stdio};
pub use std::sync::atomic::{AtomicU64, Ordering};
pub use std::sync::{Arc, Mutex, MutexGuard};
pub use std::thread;
pub use std::time::Duration;
pub use tauri::{AppHandle, Emitter, State};

use super::*;

#[cfg(test)]
pub mod tests {
    use super::*;

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
    fn a_line_of_exactly_the_limit_stays_whole() {
        let exact = vec![b'a'; MAX_LINE_BYTES];

        let chunks = split_line(&exact);

        assert_eq!(
            chunks.len(),
            1,
            "exactly {MAX_LINE_BYTES} bytes is one line"
        );
        assert_eq!(chunks[0].len(), MAX_LINE_BYTES);
    }

    #[test]
    fn a_line_above_the_limit_is_split_at_the_limit() {
        let over = vec![b'b'; MAX_LINE_BYTES + 3];

        let chunks = split_line(&over);

        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].len(), MAX_LINE_BYTES);
        assert_eq!(chunks[1], "bbb");

        assert_eq!(split_line(&vec![b'c'; MAX_LINE_BYTES * 2]).len(), 2);
    }

    #[test]
    fn invalid_utf8_becomes_replacement_characters() {
        let chunks = split_line(b"ok\xff end");

        assert_eq!(chunks, vec!["ok\u{fffd} end".to_string()]);
    }

    #[test]
    fn a_blank_line_is_one_empty_chunk() {
        assert_eq!(split_line(b""), vec![String::new()]);
    }

    #[test]
    fn exit_codes_map_to_a_number_or_null() {
        let exited = exited_payload("run-7", Some(3));
        assert_eq!(exited["runId"], "run-7");
        assert_eq!(exited["code"], 3);

        let killed = exited_payload("run-7", None);
        assert_eq!(killed["code"], Value::Null);
        assert!(killed["code"].as_i64().is_none());
    }

    #[test]
    fn output_payloads_name_their_stream() {
        let stdout = output_payload("run-1", STDOUT, "hello".to_string());

        assert_eq!(stdout["runId"], "run-1");
        assert_eq!(stdout["stream"], "stdout");
        assert_eq!(stdout["line"], "hello");
        assert_eq!(
            output_payload("run-1", STDERR, "oops".to_string())["stream"],
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
