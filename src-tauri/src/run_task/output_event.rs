#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use serde_json::{Value, json};
pub use std::collections::HashMap;
pub use std::io::{self, BufRead, BufReader, ErrorKind, Read, Write};
pub use std::path::{Path, PathBuf};
pub use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};
pub use std::sync::atomic::{AtomicU64, Ordering};
pub use std::sync::mpsc::{self, Receiver, Sender};
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
/// The interval every bounded wait in the app polls at, owned by `teardown` so there is one value.
pub use crate::teardown::WAIT_INTERVAL;

/// Live children by run id. The map is shared with the waiter threads, which drop their own entry.
pub type Runs = HashMap<String, Arc<Mutex<Option<Child>>>>;

/// Live stdin pipes by run id; a run's handle is gone once its waiter reports the exit.
pub type StdinHandles = HashMap<String, ChildStdin>;

/// Managed state: one live child per run id, and the counter that names the next run.
#[derive(Default)]
pub struct RunState {
    pub(crate) runs: Arc<Mutex<Runs>>,
    /// Kept apart from the child so a blocked write never holds the lock a stop needs.
    pub(crate) stdin: Arc<Mutex<StdinHandles>>,
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
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for var in &env_vars {
        command.env(&var.name, &var.value);
    }
    // Its own group, so a stop reaches what the program started: `rustc` under `cargo build` is a
    // grandchild, and a signal to the direct child alone leaves it building.
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("cannot run {program_text} in {cwd_text}: {error}"))?;

    let (Some(stdin), Some(stdout), Some(stderr)) =
        (child.stdin.take(), child.stdout.take(), child.stderr.take())
    else {
        let _ = stop_tree(child);
        return Err(format!(
            "cannot capture the input and output of {program_text}: its pipes were not created"
        ));
    };

    let run_id = next_id(&state.counter);
    let entry: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(Some(child)));
    lock(&state.runs).insert(run_id.clone(), Arc::clone(&entry));
    lock(&state.stdin).insert(run_id.clone(), stdin);

    // One channel per run: both readers write into it, the emitter drains it in order.
    let (events, receiver) = mpsc::channel::<RunEvent>();
    let failure = [
        spawn_reader(&run_id, STDOUT, stdout, events.clone()),
        spawn_reader(&run_id, STDERR, stderr, events.clone()),
    ]
    .into_iter()
    .find_map(Result::err)
    .or_else(|| {
        spawn_waiter(
            &run_id,
            entry,
            Arc::clone(&state.runs),
            Arc::clone(&state.stdin),
            events.clone(),
        )
        .err()
    })
    .or_else(|| spawn_emitter(&app, &run_id, receiver).err());
    drop(events);

    if let Some(error) = failure {
        discard(&state.runs, &state.stdin, &run_id);
        return Err(format!(
            "cannot stream the output of {program_text}: {error}"
        ));
    }

    Ok(run_id)
}

/// Kill every live run; used when the window goes away and on exit, so no program outlives it.
impl RunState {
    pub fn shutdown_all(&self) {
        let runs: Vec<_> = lock(&self.runs).drain().map(|(_, entry)| entry).collect();
        lock(&self.stdin).clear();
        for entry in runs {
            if let Some(child) = lock(&entry).take() {
                let _ = stop_tree(child);
            }
        }
    }
}

/// Stop one run's whole process group; an unknown or already-finished run is not an error.
#[tauri::command]
pub async fn stop_program(state: State<'_, RunState>, run_id: String) -> Result<Stop, String> {
    let Some(entry) = lock(&state.runs).get(&run_id).cloned() else {
        return Ok(Stop::quiet());
    };

    let Some(child) = lock(&entry).take() else {
        // The waiter already reaped it and is about to report the exit.
        return Ok(Stop::quiet());
    };

    // No state lock is held from here on: the group is signalled and reaped on a blocking thread,
    // so a program that ignores the polite signal cannot pin an async worker.
    let terminated = tauri::async_runtime::spawn_blocking(move || stop_tree(child))
        .await
        .map_err(|error| format!("cannot stop {run_id}: {error}"))?;

    match terminated {
        Terminated::Stopped(stop) => Ok(stop),
        Terminated::Failed { child, error } => {
            // Hand the child back so the waiter keeps watching it instead of leaking a zombie.
            lock(&entry).replace(child);
            Err(format!("cannot stop {run_id}: {error}"))
        }
    }
}
