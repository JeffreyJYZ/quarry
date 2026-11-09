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

    #[test]
    fn a_child_that_ignores_the_polite_signal_is_killed_hard() {
        let child = grouped("/bin/sh", "-c")
            .args(["trap '' TERM; while :; do :; done"])
            .spawn()
            .expect("spawn a TERM-ignoring shell");
        // The trap is installed a moment after the shell starts; a TERM before that is untrapped.
        thread::sleep(Duration::from_millis(300));

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
    #[test]
    fn the_group_signal_reaches_a_grandchild_that_outlives_its_parent() {
        let dir = TempDir::new("group-kill");
        let late = dir.path().join("late.txt");
        let script = format!("(sleep 1; echo late > '{}') & wait", late.display());
        let mut command = grouped("/bin/sh", "-c");
        command.args([&script]);
        let child = command.spawn().expect("spawn a shell with a grandchild");

        match terminate(
            child,
            Duration::from_millis(300),
            Duration::from_millis(500),
        ) {
            Terminated::Stopped(_) => {}
            Terminated::Failed { .. } => panic!("the group must be signalled"),
        }

        // Past the point the grandchild would have written on its own.
        thread::sleep(Duration::from_millis(1400));
        assert!(
            !late.exists(),
            "a grandchild survived the stop and kept running"
        );
    }
}
