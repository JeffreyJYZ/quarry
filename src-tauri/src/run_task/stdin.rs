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

/// What a caller's text becomes: verbatim, plus one newline unless it already ends with one.
pub fn input_line(text: &str) -> String {
    if text.ends_with('\n') {
        text.to_string()
    } else {
        format!("{text}\n")
    }
}

/// Write one line into a run's stdin.
///
/// A run with no handle never had one, or its waiter already forgot it. A handle whose write fails
/// with a broken pipe is a program that closed its input, which is how an exit reads from here; the
/// dead handle is dropped so the next send refuses instead of trying again.
pub fn write_stdin(handles: &Mutex<StdinHandles>, run_id: &str, text: &str) -> Result<(), String> {
    let mut guard = lock(handles);
    let Some(handle) = guard.get_mut(run_id) else {
        return Err(format!(
            "cannot send input to {run_id}: no program is running under that id"
        ));
    };

    match handle
        .write_all(input_line(text).as_bytes())
        .and_then(|()| handle.flush())
    {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::BrokenPipe => {
            guard.remove(run_id);
            Err(format!(
                "cannot send input to {run_id}: the program has exited"
            ))
        }
        Err(error) => Err(format!("cannot send input to {run_id}: {error}")),
    }
}

/// Send one line to the program a run started.
///
/// The write runs on a blocking thread: a program that stopped reading fills its pipe, and a
/// blocked async worker would stall everything else the frontend asked for.
#[tauri::command]
pub async fn run_stdin(
    state: State<'_, RunState>,
    run_id: String,
    text: String,
) -> Result<(), String> {
    let handles = Arc::clone(&state.stdin);
    let id = run_id.clone();
    tauri::async_runtime::spawn_blocking(move || write_stdin(&handles, &id, &text))
        .await
        .map_err(|error| format!("cannot send input to {run_id}: {error}"))?
}
