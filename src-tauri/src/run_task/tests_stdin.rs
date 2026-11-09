#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use serde_json::{Value, json};
pub use std::collections::HashMap;
pub use std::io::{self, BufRead, BufReader, ErrorKind, Read, Write};
pub use std::path::{Path, PathBuf};
pub use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};
pub use std::sync::atomic::{AtomicU64, Ordering};
pub use std::sync::{Arc, Mutex, MutexGuard};
pub use std::thread;
pub use std::time::Duration;
pub use tauri::{AppHandle, Emitter, State};

use super::*;

#[cfg(test)]
pub mod stdin_tests {
    use crate::run_task::*;
    use crate::test_support::TempDir;

    /// A run with no handle at all is a panel asking the backend for something it never started.
    #[test]
    fn an_unknown_run_is_refused() {
        let handles: Mutex<StdinHandles> = Mutex::new(HashMap::new());

        let error = write_stdin(&handles, "run-99", "hello").expect_err("no such run");

        assert!(
            error.contains("no program is running"),
            "unexpected error: {error}"
        );
        assert!(
            error.contains("run-99"),
            "error should name the run: {error}"
        );
    }

    /// The program writes its own newline; a supplied one must not become a blank second line.
    #[test]
    fn one_newline_ends_the_line_whichever_way_it_arrives() {
        assert_eq!(input_line("hello"), "hello\n");
        assert_eq!(input_line("hello\n"), "hello\n");
        assert_eq!(input_line(""), "\n");
    }

    /// A write that reaches a real child, and the echo that comes back on its output stream.
    #[cfg(unix)]
    #[test]
    fn a_write_reaches_the_program_and_its_echo_arrives() {
        let dir = TempDir::new("stdin-cat");
        let mut child = Command::new("/bin/cat")
            .current_dir(dir.path())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("spawn cat");
        let stdin = child.stdin.take().expect("piped stdin");
        let stdout = child.stdout.take().expect("piped stdout");
        let handles = Mutex::new(HashMap::from([("run-1".to_string(), stdin)]));

        write_stdin(&handles, "run-1", "hello cat").expect("write to cat");
        // Closing the pipe is what makes `cat` finish, the same way an exit closes it.
        drop(handles);

        let mut chunks = Vec::new();
        pump(BufReader::new(stdout), |chunk| chunks.push(chunk)).expect("read the echo");
        child.wait().expect("reap cat");

        let echo: String = chunks.into_iter().map(|chunk| chunk.text).collect();
        assert_eq!(echo, "hello cat");
    }

    /// A program that already exited has closed its input, so the next send says so and forgets it.
    #[cfg(unix)]
    #[test]
    fn a_write_to_an_exited_program_is_refused() {
        let mut child = Command::new("/bin/echo")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn echo");
        let stdin = child.stdin.take().expect("piped stdin");
        child.wait().expect("reap echo");
        let handles = Mutex::new(HashMap::from([("run-2".to_string(), stdin)]));

        let error = write_stdin(&handles, "run-2", "still there?").expect_err("echo has exited");

        assert!(error.contains("has exited"), "unexpected error: {error}");
        assert!(
            lock(&handles).get("run-2").is_none(),
            "a dead pipe must not be kept for the next send"
        );
    }
}
