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

#[cfg(unix)]
pub use std::os::unix::process::ExitStatusExt;

use super::*;

/// How a child ended: the number it exited with, and the signal that killed it when there was one.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Exit {
    pub code: Option<i32>,
    pub signal: Option<i32>,
}

impl Exit {
    /// The child was taken away by a stop, so neither its code nor its signal is knowable.
    pub fn unknown() -> Self {
        Self::default()
    }

    /// A process that died from a signal, which is how the panel learns what killed it.
    #[cfg(test)]
    pub fn from_signal(signal: i32) -> Self {
        Self {
            code: None,
            signal: Some(signal),
        }
    }

    pub fn from_status(status: ExitStatus) -> Self {
        Self {
            code: status.code(),
            signal: signal_of(status),
        }
    }
}

#[cfg(unix)]
pub fn signal_of(status: ExitStatus) -> Option<i32> {
    status.signal()
}

/// Windows has no signals; a process there always carries a code or is simply gone.
#[cfg(not(unix))]
pub fn signal_of(_status: ExitStatus) -> Option<i32> {
    None
}

/// Outcome of one non-blocking look at the child.
pub enum Reap {
    /// The child exited and was reaped here.
    Exited(Exit),
    /// `stop_program` or the shutdown path took the child; the exit status is unknowable.
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
            Reap::Exited(Exit::from_status(status))
        }
        Ok(None) => Reap::Running,
        Err(_) => {
            *guard = None;
            Reap::Gone
        }
    }
}

/// Block the caller's thread until the child is gone, then give its exit status.
pub fn wait_for_exit(entry: &Mutex<Option<Child>>) -> Exit {
    loop {
        match reap(entry) {
            Reap::Exited(exit) => return exit,
            Reap::Gone => return Exit::unknown(),
            Reap::Running => thread::sleep(WAIT_INTERVAL),
        }
    }
}

/// Roll back a run whose threads could not start: kill the group, reap, forget.
pub fn discard(runs: &Mutex<Runs>, stdin: &Mutex<StdinHandles>, run_id: &str) {
    lock(stdin).remove(run_id);
    let Some(entry) = lock(runs).remove(run_id) else {
        return;
    };
    if let Some(child) = lock(&entry).take() {
        let _ = stop_tree(child);
    }
}

/// A poisoned mutex still holds a usable value, and no path here panics while holding one.
pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|error| error.into_inner())
}

pub fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}
