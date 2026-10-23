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

/// Emit one event per complete line of one stream, until the pipe closes.
pub fn pump<R: Read>(reader: R, app: &AppHandle, run_id: &str, stream: &'static str) {
    let mut reader = BufReader::new(reader);
    let mut buffer = Vec::new();

    loop {
        buffer.clear();
        match reader.read_until(b'\n', &mut buffer) {
            Ok(0) => break,
            Ok(_) => {
                strip_terminator(&mut buffer);
                for line in split_line(&buffer) {
                    let payload = output_payload(run_id, stream, line);
                    let _ = app.emit(OUTPUT_EVENT, payload);
                }
            }
            Err(error) if error.kind() == ErrorKind::Interrupted => {}
            Err(_) => break,
        }
    }
}
/// Drop the line ending so a CRLF stream does not surface a stray carriage return.
pub fn strip_terminator(line: &mut Vec<u8>) {
    if line.last() == Some(&b'\n') {
        line.pop();
    }
    if line.last() == Some(&b'\r') {
        line.pop();
    }
}

/// Split one physical line into [`MAX_LINE_BYTES`] chunks and decode each one lossily.
///
/// A chunk boundary can fall inside a UTF-8 sequence, which is why each chunk is decoded with
/// `from_utf8_lossy`: a replacement character is better than losing the rest of the line. A blank
/// line is one empty chunk, so the panel keeps the program's spacing.
pub fn split_line(line: &[u8]) -> Vec<String> {
    let mut chunks: Vec<String> = line
        .chunks(MAX_LINE_BYTES)
        .map(|chunk| String::from_utf8_lossy(chunk).into_owned())
        .collect();
    if chunks.is_empty() {
        chunks.push(String::new());
    }
    chunks
}

/// Detached thread that reports the exit and forgets the run.
pub fn spawn_waiter(
    app: &AppHandle,
    run_id: &str,
    entry: Arc<Mutex<Option<Child>>>,
    runs: Arc<Mutex<Runs>>,
) -> io::Result<()> {
    let app = app.clone();
    let id = run_id.to_string();
    thread::Builder::new()
        .name(format!("{run_id}-waiter"))
        .spawn(move || {
            let code = wait_for_exit(&entry);
            let payload = exited_payload(&id, code);
            let _ = app.emit(EXITED_EVENT, payload);
            lock(&runs).remove(&id);
        })
        .map(drop)
}

/// Block the caller's thread until the child is gone, then give its exit code.
pub fn wait_for_exit(entry: &Mutex<Option<Child>>) -> Option<i32> {
    loop {
        match reap(entry) {
            Reap::Exited(code) => return code,
            Reap::Gone => return None,
            Reap::Running => thread::sleep(WAIT_INTERVAL),
        }
    }
}

/// Outcome of one non-blocking look at the child.
pub enum Reap {
    /// The child exited and was reaped here.
    Exited(Option<i32>),
    /// `stop_program` or the shutdown path took the child; the exit code is unknowable.
    Gone,
    /// Still running.
    Running,
}

pub fn reap(entry: &Mutex<Option<Child>>) -> Reap {
    let mut guard = lock(entry);
    let Some(child) = guard.as_mut() else {
        return Reap::Gone;
    };
    match child.try_wait() {
        Ok(Some(status)) => {
            // Drop the handle, so no later path can signal a pid the system may have recycled.
            *guard = None;
            Reap::Exited(status.code())
        }
        Ok(None) => Reap::Running,
        Err(_) => {
            *guard = None;
            Reap::Gone
        }
    }
}

/// Roll back a run whose threads could not start: kill, reap, forget.
pub fn discard(runs: &Mutex<Runs>, run_id: &str) {
    let Some(entry) = lock(runs).remove(run_id) else {
        return;
    };
    if let Some(mut child) = lock(&entry).take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// A poisoned mutex still holds a usable value, and no path here panics while holding one.
pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|error| error.into_inner())
}

pub fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}
