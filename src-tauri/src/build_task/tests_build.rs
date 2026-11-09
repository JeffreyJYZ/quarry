#![allow(unused_imports)]

pub use std::process::{Command, Stdio};
pub use std::time::{Duration, Instant};

use super::*;

#[cfg(all(test, unix))]
pub mod build_state_tests {
    use crate::build_task::*;

    /// A stand-in for a build: a shell that starts a compiler-shaped grandchild and waits.
    fn start(state: &BuildState, script: &str) -> (Slot, u32) {
        let mut command = Command::new("/bin/sh");
        command.arg("-c").arg(script);
        let child = spawn(&mut command, "sh", "/").expect("spawn fake build");
        let pid = child.id();
        let slot = state.begin(child).expect("take the build slot");
        (slot, pid)
    }

    /// `kill -0` on a pid, or on a whole group with `-<pid>`; `false` means the kernel has none.
    fn alive(target: &str) -> bool {
        Command::new("/bin/kill")
            .args(["-0", "--", target])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    /// A dead group can hold one zombie for a moment, so the group is watched rather than sampled.
    fn group_gone(pid: u32) -> bool {
        let target = format!("-{pid}");
        let deadline = Instant::now() + Duration::from_secs(3);
        while Instant::now() < deadline {
            if !alive(&target) {
                return true;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        false
    }

    #[test]
    fn a_running_build_is_reachable_from_the_state() {
        let state = BuildState::default();
        let (slot, pid) = start(&state, "sleep 30");

        assert_eq!(state.pid(), Some(pid), "the state knows the build's pid");
        assert!(state.is_running(), "the build child is alive");

        state.stop().expect("stop the fake build");
        state.finish(&slot);
        assert!(group_gone(pid), "a stopped build leaves no group behind");
    }

    #[test]
    fn stop_build_kills_the_process_group_not_just_the_shell() {
        let state = BuildState::default();
        // The group holds the grandchild a real cargo build spawns as `rustc`.
        let (_, pid) = start(&state, "sleep 30 & sleep 30");

        state.stop().expect("stop the fake build");

        assert!(
            group_gone(pid),
            "the group survived the stop, so the grandchild kept running"
        );
    }

    #[test]
    fn shutdown_all_stops_a_build_so_no_compiler_outlives_the_window() {
        let state = BuildState::default();
        let (_, pid) = start(&state, "sleep 30");

        state.shutdown_all();

        assert!(
            group_gone(pid),
            "quitting mid-build left the compiler running"
        );
        assert_eq!(state.pid(), None, "the state forgot the build it killed");
    }

    #[test]
    fn stopping_with_no_build_running_is_a_quiet_no_op() {
        let state = BuildState::default();

        let stop = state.stop().expect("nothing to stop is not an error");

        assert!(
            !stop.escalated,
            "nothing was signalled, so nothing escalated"
        );
        assert_eq!(state.pid(), None);
        assert!(!state.is_running());

        // A finished build is the same case: the slot is empty and the stop still answers quietly.
        let (slot, _) = start(&state, "sleep 30");
        state.stop().expect("stop the running build");
        state.finish(&slot);
        assert!(state.stop().is_ok(), "a stopped build can be stopped again");
    }

    #[test]
    fn a_second_build_is_refused_and_the_newcomer_is_killed() {
        let state = BuildState::default();
        let (_, pid) = start(&state, "sleep 30");

        let mut extra = Command::new("/bin/sleep");
        extra.arg("30");
        let newcomer = spawn(&mut extra, "sleep", "/").expect("spawn newcomer");
        let newcomer_pid = newcomer.id();

        let error = state.begin(newcomer).expect_err("the slot is taken");
        assert!(
            error.contains("already running"),
            "the refusal names the reason"
        );
        assert!(
            !alive(&newcomer_pid.to_string()),
            "the refused child was left running"
        );
        assert!(
            alive(&format!("-{pid}")),
            "the build it refused for is untouched"
        );

        state.stop().expect("stop the fake build");
    }
}
