#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
pub use serde_json::Value;
pub use std::collections::HashSet;
pub use std::path::Path;
pub use std::process::{Child, Command, Stdio};
pub use std::time::Instant;

use super::*;
use crate::run_task::{Terminated, stop_tree};
use crate::teardown::{KILL_GRACE, WAIT_INTERVAL};
use std::thread;

/// The program a group check and its last-resort kill need, as an absolute path so a GUI launch's
/// `PATH` cannot hide it.
#[cfg(unix)]
const KILL_PROGRAM: &str = "/bin/kill";

/// Stop a build's whole process group, then prove the group is empty rather than trusting the
/// leader's death.
///
/// A group signal is delivered once, to the members that exist at that instant. A build that forks
/// while it is being signalled — `cargo` starting `rustc`, `cmake` starting `cc` — can create a
/// child that inherits the group after the signal was delivered, so no signal ever reaches it. The
/// polite path then ends as soon as the direct child is reaped, and that escaped compiler keeps
/// running with nothing left holding a pid to signal. Asking whether the group still has a member
/// costs one `kill -0` and closes the window.
pub fn stop_group(child: Child) -> Terminated {
    let pid = child.id();
    let terminated = stop_tree(child);
    if matches!(terminated, Terminated::Stopped(_)) {
        sweep_group(pid);
    }
    terminated
}

/// `true` while the group led by `pid` still has any member.
///
/// The negative pid names the group, so this asks about the whole tree and signals nothing. While a
/// member is alive its process group id is `pid`, and the kernel does not hand a pid out while it
/// is in use as a group id, so this cannot be asking about somebody else's group.
#[cfg(unix)]
fn group_occupied(pid: u32) -> bool {
    Command::new(KILL_PROGRAM)
        .args(["-0", "--", &format!("-{pid}")])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

/// Windows has no process group to ask about, so nothing lies beyond the child's own kill.
#[cfg(not(unix))]
fn group_occupied(_pid: u32) -> bool {
    false
}

/// Kills the whole group until no member is left, bounded by the grace a hard kill gets.
///
/// The kill repeats because the same window reopens on it: a member can fork between one signal
/// and the next look. Once every member is dead nothing is left to fork, so the loop ends.
fn sweep_group(pid: u32) {
    let deadline = Instant::now() + KILL_GRACE;
    while group_occupied(pid) {
        if Instant::now() >= deadline {
            return;
        }
        kill_group(pid);
        thread::sleep(WAIT_INTERVAL);
    }
}

#[cfg(unix)]
fn kill_group(pid: u32) {
    let _ = Command::new(KILL_PROGRAM)
        .args(["-s", "KILL", "--", &format!("-{pid}")])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(not(unix))]
fn kill_group(_pid: u32) {}
