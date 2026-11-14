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

#[cfg(all(test, unix))]
pub mod stop_tests {
    use crate::run_task::*;
    use crate::test_support::TempDir;

    /// A child in its own process group, exactly as `run_program` spawns one.
    fn grouped(program: &str, arg: &str) -> Command {
        use std::os::unix::process::CommandExt;
        let mut command = Command::new(program);
        command
            .arg(arg)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .process_group(0);
        command
    }

    fn alive(pid: u32) -> bool {
        Command::new("/bin/kill")
            .args(["-0", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    #[test]
    fn a_polite_signal_stops_a_sleeping_child_without_escalating() {
        let started = Instant::now();
        let child = grouped("/bin/sleep", "30").spawn().expect("spawn sleep");
        let pid = child.id();

        match terminate(child, Duration::from_secs(2), Duration::from_millis(500)) {
            Terminated::Stopped(stop) => {
                assert!(
                    !stop.escalated,
                    "sleep died on TERM, so nothing was escalated"
                );
                assert!(
                    started.elapsed() < Duration::from_secs(2),
                    "the stop waited out the grace period instead of noticing the exit"
                );
                assert!(!alive(pid), "the child outlived its stop");
            }
            Terminated::Failed { .. } => panic!("a signal to /bin/sleep cannot fail"),
        }
    }

    /// A TERM-ignoring shell in its own process group that announces its installed trap on stdout.
    fn term_ignoring_shell() -> Child {
        use std::os::unix::process::CommandExt;
        let mut command = Command::new("/bin/sh");
        command
            .args(["-c", "trap '' TERM; echo ready; while :; do :; done"])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .process_group(0);
        command.spawn().expect("spawn a TERM-ignoring shell")
    }

    /// The marker is written after `trap` took effect, so reading it is the happens-before edge the
    /// signal needs; a sleep in its place could let a loaded machine deliver TERM before the trap
    /// existed, and the shell would then die without escalating.
    fn wait_for_trap(child: &mut Child) {
        let stdout = child.stdout.take().expect("the shell's stdout");
        let mut marker = String::new();
        BufReader::new(stdout)
            .read_line(&mut marker)
            .expect("read the trap marker");
        assert_eq!(
            marker.trim(),
            "ready",
            "the shell must install its trap first"
        );
    }

    #[test]
    fn a_child_that_ignores_the_polite_signal_is_killed_hard() {
        let mut child = term_ignoring_shell();
        wait_for_trap(&mut child);

        match terminate(child, Duration::from_millis(200), Duration::from_secs(2)) {
            Terminated::Stopped(stop) => {
                assert!(
                    stop.escalated,
                    "the shell ignored TERM, so the kill must escalate"
                )
            }
            Terminated::Failed { .. } => panic!("killing the group cannot fail here"),
        }
    }

    #[test]
    fn an_already_finished_child_is_not_an_error() {
        let mut child = Command::new("/bin/echo").spawn().expect("spawn echo");
        child.wait().expect("reap echo");

        match terminate(child, Duration::from_millis(50), Duration::from_millis(50)) {
            Terminated::Stopped(stop) => assert!(!stop.escalated, "it had already exited"),
            Terminated::Failed { .. } => panic!("a gone child is stopped, not a failure"),
        }
    }

    /// The `cargo build` shape: the direct child dies on the polite signal but the `rustc` it started
    /// would keep working unless the signal reaches the whole group.
    ///
    /// The grandchild's *pid* is the witness, not a file it would have written later: a CI runner
    /// under load can take longer than the child's own deadline to signal, and the old assertion read
    /// that as a surviving grandchild — measured failing once on Linux with the same product code
    /// that passes here. Asking whether that pid still exists has no timing window at all.
    #[test]
    fn the_group_signal_reaches_a_grandchild_that_outlives_its_parent() {
        let dir = TempDir::new("group-kill");
        let pid_file = dir.path().join("grandchild.pid");
        let script = format!("(echo $$ > '{}'; sleep 30) & wait", pid_file.display());
        let mut command = grouped("/bin/sh", "-c");
        command.args([&script]);
        let child = command.spawn().expect("spawn a shell with a grandchild");
        let grandchild = wait_for_pid(&pid_file);

        match terminate(
            child,
            Duration::from_millis(300),
            Duration::from_millis(500),
        ) {
            Terminated::Stopped(_) => {}
            Terminated::Failed { .. } => panic!("the group must be signalled"),
        }

        // The group signal reaches every member, so the grandchild is gone within a grace of the stop.
        assert!(
            wait_until_gone(grandchild, Duration::from_secs(3)),
            "a grandchild survived the stop and kept running (pid {grandchild})"
        );
    }

    /// The grandchild's pid, once it has written it.
    fn wait_for_pid(path: &std::path::Path) -> u32 {
        for _ in 0..200 {
            if let Ok(text) = std::fs::read_to_string(path)
                && let Ok(pid) = text.trim().parse()
            {
                return pid;
            }
            thread::sleep(Duration::from_millis(20));
        }
        panic!("the grandchild never wrote its pid to {}", path.display());
    }

    /// Whether a process is gone, bounded: `kill -0` probes existence without signalling anything.
    fn wait_until_gone(pid: u32, limit: Duration) -> bool {
        let started = Instant::now();
        while started.elapsed() < limit {
            let alive = Command::new("kill")
                .args(["-0", &pid.to_string()])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .is_ok_and(|status| status.success());
            if !alive {
                return true;
            }
            thread::sleep(Duration::from_millis(20));
        }
        false
    }
}
