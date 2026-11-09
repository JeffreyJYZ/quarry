#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
pub use serde_json::Value;
pub use std::collections::HashSet;
pub use std::io::{self, Read};
pub use std::path::Path;
pub use std::process::{Child, ChildStderr, ChildStdout, Command, Stdio};
pub use std::thread::{self, JoinHandle};
pub use std::time::{Duration, Instant};

use super::*;
use crate::run_task::{Exit, Reap, lock, reap, stop_tree};
use crate::teardown::until_gone;

/// How long one bounded wait looks at the child before looking again.
///
/// `until_gone` bounds a single look and the caller re-enters, so a compile longer than a slice is
/// never cut short while a stop that takes the handle still ends the wait at once.
pub const WAIT_SLICE: Duration = Duration::from_millis(200);

/// What every branch reports when the user stopped the build.
pub const CANCELLED_SUMMARY: &str = "build cancelled";

/// One pipe's collected bytes, read on its own thread to EOF.
pub type Pipe = JoinHandle<Vec<u8>>;

/// One build command's outcome: the exit verdict and both captured streams.
pub struct Captured {
    /// The command exited `0`, which says nothing about the diagnostics it printed.
    pub success: bool,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    /// A stop took the child, so its exit says nothing about whether the build worked.
    pub stopped: bool,
}

/// Spawn a build as its own process-group leader with both pipes captured.
///
/// Its own group is what makes a stop reach the compiler the build started: `rustc` under
/// `cargo build` and `cc` under `cmake --build` are grandchildren, and signalling the direct child
/// alone left them compiling after the build was cancelled.
pub fn spawn(command: &mut Command, label: &str, cwd: &str) -> Result<Child, String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command
        .spawn()
        .map_err(|error| format!("cannot run {label} in {cwd}: {error}"))
}

/// Run one build command with its child in managed state, then wait for it under a bound.
pub fn run_child(
    state: &BuildState,
    command: &mut Command,
    label: &str,
    cwd: &str,
) -> Result<Captured, String> {
    let mut child = spawn(command, label, cwd)?;
    let (Some(stdout), Some(stderr)) = (child.stdout.take(), child.stderr.take()) else {
        let _ = stop_tree(child);
        return Err(format!(
            "cannot capture the output of {label}: its pipes were not created"
        ));
    };

    // Both pipes are read as the build writes them, so a chatty build never fills a pipe and
    // stalls waiting for a reader that only starts once the child is gone.
    let readers = match read_both(label, stdout, stderr) {
        Ok(readers) => readers,
        Err(error) => {
            let _ = stop_tree(child);
            return Err(format!("cannot read the output of {label}: {error}"));
        }
    };

    // Refused means another build owns the slot; `begin` kills this child itself, so both pipes
    // close and the readers started above reach EOF.
    let slot = state.begin(child)?;

    let exit = await_child(&slot);
    let (stdout, stderr) = (joined(readers.0), joined(readers.1));

    // Whatever is still in the slot was never reaped (a failed stop hands the child back), so it is
    // killed here rather than left running behind a report that already called the build finished.
    if let Some(child) = lock(&slot).take() {
        let _ = stop_tree(child);
    }
    state.finish(&slot);

    Ok(Captured {
        success: exit.and_then(|exit| exit.code) == Some(0),
        stdout,
        stderr,
        stopped: exit.is_none(),
    })
}

/// Wait for the build child until it is gone, reporting its exit or `None` when a stop took it.
fn await_child(slot: &Mutex<Option<Child>>) -> Option<Exit> {
    let mut exited: Option<Exit> = None;
    while !until_gone(
        || match reap(slot) {
            Reap::Exited(exit) => {
                exited = Some(exit);
                true
            }
            Reap::Gone => true,
            Reap::Running => false,
        },
        WAIT_SLICE,
    ) {}
    exited
}

/// One reader thread per pipe: it collects until EOF, which is when the group is gone.
fn read_both(label: &str, stdout: ChildStdout, stderr: ChildStderr) -> io::Result<(Pipe, Pipe)> {
    let out = reader(format!("{label}-stdout"), stdout)?;
    let err = reader(format!("{label}-stderr"), stderr)?;
    Ok((out, err))
}

fn reader<R: Read + Send + 'static>(name: String, mut pipe: R) -> io::Result<Pipe> {
    thread::Builder::new().name(name).spawn(move || {
        let mut collected = Vec::new();
        let _ = pipe.read_to_end(&mut collected);
        collected
    })
}

fn joined(handle: Pipe) -> Vec<u8> {
    handle.join().unwrap_or_default()
}
