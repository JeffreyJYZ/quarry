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
pub use std::time::{Duration, Instant};
pub use tauri::{AppHandle, Emitter, State};

use super::*;

/// Longest the polite signal gets before the group is killed outright.
pub const TERM_GRACE: Duration = Duration::from_millis(1500);

/// Longest the hard kill gets before the stop returns and the reap is handed to its own thread.
pub use crate::teardown::{KILL_GRACE, until_gone};

/// A unix child is spawned as its own process-group leader, so a signal to `-pid` reaches every
/// process it started; `cargo build`'s `rustc` is one of those.
#[cfg(unix)]
const GRACEFUL: bool = true;

/// Windows has no process group to signal, so the only signal is the hard one.
#[cfg(not(unix))]
const GRACEFUL: bool = false;

/// The one program a stop needs; an absolute path so a GUI launch's `PATH` cannot hide it.
#[cfg(unix)]
const KILL_PROGRAM: &str = "/bin/kill";

/// What a stop did, as the frontend sees it.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stop {
    /// The polite signal was ignored, so the group was killed instead of exiting on its own.
    pub escalated: bool,
}

impl Stop {
    /// Nothing had to be signalled, which is also the answer for an unknown run id.
    pub fn quiet() -> Self {
        Self::default()
    }
}

/// A child went away, or could not be signalled and must be handed back to its waiter.
pub enum Terminated {
    Stopped(Stop),
    Failed { child: Child, error: String },
}

/// Stop one run's process group with the production bounds.
pub fn stop_tree(child: Child) -> Terminated {
    terminate(child, TERM_GRACE, KILL_GRACE)
}

/// Ask the group to exit, then kill it, never blocking past the two graces.
///
/// The child must be its own process-group leader (spawned with `process_group(0)`), which is what
/// makes the negative-pid signal reach the grandchildren a build leaves behind. A child that is
/// already gone counts as stopped: `kill` fails with "no such process", which is not an error.
pub fn terminate(mut child: Child, term_grace: Duration, kill_grace: Duration) -> Terminated {
    if ended(&mut child) {
        return Terminated::Stopped(Stop::quiet());
    }

    let mut failure = None;
    let mut escalated = false;

    // A polite signal first: a server or a stdin reader gets to flush and exit on its own terms.
    if GRACEFUL {
        failure = signal(&mut child, false).err();
        if drained(&mut child, term_grace) {
            return Terminated::Stopped(Stop::quiet());
        }
        escalated = true;
    }

    if let Err(error) = signal(&mut child, true)
        && failure.is_none()
    {
        failure = Some(error);
    }
    if drained(&mut child, kill_grace) {
        return Terminated::Stopped(Stop { escalated });
    }

    match failure {
        // Nothing could be signalled at all, so the waiter must keep watching it.
        Some(error) => Terminated::Failed {
            child,
            error: error.to_string(),
        },
        // Signalled but not yet confirmed dead: reap it off this thread, so the stop returns and no
        // zombie is left for the app.
        None => {
            reap_later(child);
            Terminated::Stopped(Stop { escalated })
        }
    }
}

/// `true` when the child can no longer be signalled: reaped here, or already gone elsewhere.
fn ended(child: &mut Child) -> bool {
    !matches!(child.try_wait(), Ok(None))
}

/// Wait up to `grace` for the child to be reaped; `true` proves the process is gone.
fn drained(child: &mut Child, grace: Duration) -> bool {
    until_gone(|| ended(child), grace)
}

/// The polite signal on unix, the hard one everywhere; the hard one is a group signal on unix.
fn signal(child: &mut Child, hard: bool) -> io::Result<()> {
    #[cfg(unix)]
    {
        signal_group(child.id(), if hard { "KILL" } else { "TERM" })
    }
    #[cfg(not(unix))]
    {
        let _ = hard;
        child.kill()
    }
}

/// Signal the whole group the child leads, not just the child: the negative pid is the group.
#[cfg(unix)]
fn signal_group(pid: u32, name: &str) -> io::Result<()> {
    let target = format!("-{pid}");
    let status = Command::new(KILL_PROGRAM)
        .args(["-s", name, "--", &target])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(io::Error::other(format!(
            "{KILL_PROGRAM} -s {name} -- {target} failed: {status}"
        )))
    }
}

/// A process that survived the hard kill is reaped on a thread of its own rather than awaited here.
fn reap_later(mut child: Child) {
    let _ = thread::Builder::new()
        .name("run-reaper".to_string())
        .spawn(move || {
            let _ = child.wait();
        });
}
