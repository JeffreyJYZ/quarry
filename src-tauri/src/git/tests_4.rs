#![allow(unused_imports)]

pub(crate) use crate::resolve;
pub(crate) use crate::types::{GitFileDiff, GitStatus, GitStatusEntry};
pub use serde::Serialize;
pub use std::fs;
pub use std::path::Path;
pub use std::process::Command;

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_4 {
    use super::*;

    use std::time::{Duration, Instant};

    /// A bound short enough for a test, long enough that a loaded machine still starts the child.
    pub const TEST_BOUND: Duration = Duration::from_millis(800);

    #[cfg(unix)]
    fn sleeping() -> Command {
        let mut command = Command::new("/bin/sh");
        command.args(["-c", "sleep 30"]);
        command
    }

    #[cfg(unix)]
    #[test]
    pub fn a_command_that_outlives_the_bound_is_stopped() {
        let started = Instant::now();
        let error = output_within(&mut sleeping(), Duration::from_millis(200))
            .expect_err("sleep 30 cannot finish in 80ms");
        assert!(error.contains("did not finish within"), "{error}");
        assert!(
            error.contains("sleep 30"),
            "the error names the command: {error}"
        );
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "the call returned instead of hanging: {:?}",
            started.elapsed()
        );
    }

    #[cfg(unix)]
    #[test]
    pub fn a_timed_out_command_leaves_no_process_behind() {
        let pid_file =
            std::env::temp_dir().join(format!("quarry-bound-{}.pid", std::process::id()));
        let _ = fs::remove_file(&pid_file);
        let mut command = Command::new("/bin/sh");
        command.args([
            "-c",
            &format!("echo $$ > {} && sleep 30", pid_file.display()),
        ]);

        output_within(&mut command, TEST_BOUND).expect_err("the shell must outlive the bound");

        let raw = fs::read_to_string(&pid_file).expect("the shell wrote its pid before sleeping");
        let pid: i32 = raw.trim().parse().expect("a pid");
        let _ = fs::remove_file(&pid_file);
        assert_eq!(
            unsafe { libc::kill(pid, 0) },
            -1,
            "pid {pid} was killed and reaped, not leaked"
        );
    }

    #[cfg(unix)]
    #[test]
    pub fn a_command_that_finishes_reports_its_output() {
        let mut command = Command::new("/bin/sh");
        command.args(["-c", "printf ok"]);
        let output = output_within(&mut command, Duration::from_secs(5)).expect("printf exits");
        assert!(output.status.success());
        assert_eq!(String::from_utf8_lossy(&output.stdout), "ok");
    }

    /// The child's output is drained while it runs, so a payload larger than a pipe buffer cannot
    /// deadlock the wait and trip the bound on a command that is only doing work.
    #[cfg(unix)]
    #[test]
    pub fn output_larger_than_a_pipe_buffer_still_finishes() {
        let mut command = Command::new("/bin/sh");
        command.args(["-c", "yes ok | head -c 200000"]);
        let output =
            output_within(&mut command, Duration::from_secs(10)).expect("the pipeline exits");
        assert_eq!(output.stdout.len(), 200000);
    }
}
