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

/// Event names the frontend listens for.
pub const OUTPUT_EVENT: &str = "run://output";

pub const EXITED_EVENT: &str = "run://exited";

/// The two stream names the output payload carries.
pub const STDOUT: &str = "stdout";

pub const STDERR: &str = "stderr";

/// One event carries at most this many bytes of a line; the rest arrives as further events.
pub const MAX_LINE_BYTES: usize = 8 * 1024;

/// How often the waiter asks the child for its status; a kill needs the lock, so it stays short.
pub const WAIT_INTERVAL: Duration = Duration::from_millis(20);

/// Live children by run id. The map is shared with the waiter threads, which drop their own entry.
pub type Runs = HashMap<String, Arc<Mutex<Option<Child>>>>;

/// Managed state: one live child per run id, and the counter that names the next run.
#[derive(Default)]
pub struct RunState {
    pub(crate) runs: Arc<Mutex<Runs>>,
    /// Only ever incremented, so an id is never reused while a stale thread is still draining.
    pub(crate) counter: AtomicU64,
}

/// One environment variable passed to a run; overrides the inherited value for that name.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvVar {
    pub name: String,
    pub value: String,
}

/// `program` and `cwd` must be absolute; `args` are passed verbatim.
#[tauri::command]
pub async fn run_program(
    app: AppHandle,
    state: State<'_, RunState>,
    program: String,
    args: Vec<String>,
    cwd: String,
    env: Option<Vec<EnvVar>>,
) -> Result<String, String> {
    let (program, cwd) = validate(&program, &cwd)?;
    let program_text = display(&program);
    let cwd_text = display(&cwd);

    let env_vars = validate_env(env)?;

    let mut command = Command::new(&program);
    command
        .args(&args)
        .current_dir(&cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for var in &env_vars {
        command.env(&var.name, &var.value);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("cannot run {program_text} in {cwd_text}: {error}"))?;

    let (Some(stdout), Some(stderr)) = (child.stdout.take(), child.stderr.take()) else {
        let _ = child.kill();
        let _ = child.wait();
        return Err(format!(
            "cannot capture the output of {program_text}: its pipes were not created"
        ));
    };

    let run_id = next_id(&state.counter);
    let entry: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(Some(child)));
    lock(&state.runs).insert(run_id.clone(), Arc::clone(&entry));

    let streams = [
        spawn_reader(&app, &run_id, STDOUT, stdout),
        spawn_reader(&app, &run_id, STDERR, stderr),
    ];
    let failure = streams
        .into_iter()
        .find_map(Result::err)
        .or_else(|| spawn_waiter(&app, &run_id, entry, Arc::clone(&state.runs)).err());

    if let Some(error) = failure {
        discard(&state.runs, &run_id);
        return Err(format!(
            "cannot stream the output of {program_text}: {error}"
        ));
    }

    Ok(run_id)
}

/// Kill a running child and reap it; an unknown id is already stopped, which is not an error.
impl RunState {
    /// Kills every live run; used on exit so no program outlives the window.
    pub fn shutdown_all(&self) {
        let runs: Vec<_> = lock(&self.runs).drain().map(|(_, entry)| entry).collect();
        for entry in runs {
            if let Some(mut child) = lock(&entry).take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[tauri::command]
pub async fn stop_program(state: State<'_, RunState>, run_id: String) -> Result<(), String> {
    let entry = lock(&state.runs).get(&run_id).cloned();
    let Some(entry) = entry else {
        return Ok(());
    };

    let Some(mut child) = lock(&entry).take() else {
        // The waiter already reaped it and is about to report the exit.
        return Ok(());
    };

    if let Err(error) = child.kill()
        && !matches!(error.kind(), ErrorKind::InvalidInput | ErrorKind::NotFound)
    {
        // Hand the child back so the waiter keeps watching it instead of leaking a zombie.
        lock(&entry).replace(child);
        return Err(format!("cannot stop {run_id}: {error}"));
    }

    child
        .wait()
        .map(|_status| ())
        .map_err(|error| format!("cannot reap {run_id}: {error}"))
}
