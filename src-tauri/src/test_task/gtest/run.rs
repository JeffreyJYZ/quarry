#![allow(unused_imports)]

use super::*;

/// A gtest case can hang, so it is killed rather than allowed to pin the command thread.
pub const GTEST_RUN_TIMEOUT: Duration = Duration::from_secs(300);

/// Runs one case through the same capture path the Cargo runner uses.
///
/// The report is the same shape, keyed by the same `Suite.Case` name the list produced, so a gtest
/// result lands in the dock exactly where a Cargo result does.
pub fn run_gtest(info: &ProjectInfo, name: &str) -> Result<TestReport, String> {
    if split_name(name).is_none() {
        return Err(format!(
            "\"{name}\" is not a GoogleTest case name: expected Suite.Case"
        ));
    }
    let program = program_for(info)?;
    let path = project::display(&program.path);
    let cwd = project::display(&program.cwd);
    let filter = format!("--gtest_filter={name}");

    let started = Instant::now();
    let captured = capture_program("run a test", &cwd, &path, &[&filter], GTEST_RUN_TIMEOUT)?;
    let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);

    Ok(TestReport {
        name: name.to_string(),
        passed: captured.status.success(),
        output: tail_output(&line_texts(&captured.lines)),
        duration_ms,
    })
}
