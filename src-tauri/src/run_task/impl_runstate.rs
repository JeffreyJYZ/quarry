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

impl Drop for RunState {
    /// Last resort at app shutdown: no child outlives the window.
    fn drop(&mut self) {
        for entry in lock(&self.runs).values() {
            let Some(mut child) = lock(entry).take() else {
                continue;
            };
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Absolute `program` that is a file and absolute `cwd` that is a directory; errors name the path.
pub fn validate(program: &str, cwd: &str) -> Result<(PathBuf, PathBuf), String> {
    let program_path = Path::new(program);
    if !program_path.is_absolute() {
        return Err(format!(
            "cannot run {program:?}: the program path must be absolute"
        ));
    }
    if !program_path.is_file() {
        return Err(format!(
            "cannot run {program:?}: it is not an existing file"
        ));
    }

    let cwd_path = Path::new(cwd);
    if !cwd_path.is_absolute() {
        return Err(format!(
            "cannot run a program in {cwd:?}: the working directory must be absolute"
        ));
    }
    if !cwd_path.is_dir() {
        return Err(format!(
            "cannot run a program in {cwd:?}: it is not an existing directory"
        ));
    }

    Ok((program_path.to_path_buf(), cwd_path.to_path_buf()))
}

/// Validate and normalize the optional environment list.
///
/// `None` and an empty list both mean "inherit the parent environment", so they normalize to an empty
/// list. Each name must be a valid POSIX-ish identifier; the first bad name rejects the whole call.
pub fn validate_env(env: Option<Vec<EnvVar>>) -> Result<Vec<EnvVar>, String> {
    let Some(vars) = env else {
        return Ok(Vec::new());
    };
    if vars.is_empty() {
        return Ok(Vec::new());
    }
    for var in &vars {
        if !valid_env_name(&var.name) {
            return Err(format!("invalid environment variable name: {}", var.name));
        }
    }
    Ok(vars)
}

pub fn valid_env_name(name: &str) -> bool {
    if name.is_empty() {
        return false;
    }
    let mut chars = name.chars();
    let first = chars.next().unwrap();
    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// Wire-stable id for the nth run.
pub fn run_id(number: u64) -> String {
    format!("run-{number}")
}

pub fn next_id(counter: &AtomicU64) -> String {
    run_id(counter.fetch_add(1, Ordering::SeqCst).saturating_add(1))
}

pub fn output_payload(run_id: &str, stream: &str, line: String) -> Value {
    json!({ "runId": run_id, "stream": stream, "line": line })
}

/// A `None` code is a kill by signal, which JSON carries as `null`.
pub fn exited_payload(run_id: &str, code: Option<i32>) -> Value {
    json!({ "runId": run_id, "code": code })
}

/// One thread per stream, detached: it ends at EOF, so a shutdown never waits on it.
pub fn spawn_reader<R: Read + Send + 'static>(
    app: &AppHandle,
    run_id: &str,
    stream: &'static str,
    reader: R,
) -> io::Result<()> {
    let app = app.clone();
    let run_id = run_id.to_string();
    thread::Builder::new()
        .name(format!("{run_id}-{stream}"))
        .spawn(move || pump(reader, &app, &run_id, stream))
        .map(drop)
}
