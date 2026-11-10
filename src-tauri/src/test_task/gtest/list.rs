#![allow(unused_imports)]

use super::*;

/// Listing a gtest binary runs it, so a binary that never returns is killed.
pub const GTEST_LIST_TIMEOUT: Duration = Duration::from_secs(20);

/// Suite label the dock shows beside a gtest group.
pub const GTEST_SUITE: &str = "gtest";

/// One discovery pass: the cases, the program asked, and a sentence for an empty answer.
#[derive(Debug)]
pub struct GtestList {
    pub items: Vec<TestItem>,
    pub program: String,
    pub note: Option<String>,
}

/// Asks the configured binary for its cases; a missing or non-gtest program is a named error.
pub fn list_gtest(info: &ProjectInfo) -> Result<GtestList, String> {
    let program = program_for(info)?;
    let path = project::display(&program.path);
    let cwd = project::display(&program.cwd);
    let captured = capture_program(
        "list GoogleTest tests",
        &cwd,
        &path,
        &["--gtest_list_tests"],
        GTEST_LIST_TIMEOUT,
    )?;

    let pairs = parse_list(&merged_text(&captured.lines));
    if pairs.is_empty() {
        if !captured.status.success() {
            return Err(not_gtest_error(&path, &program.preset, &captured));
        }
        return Ok(GtestList {
            items: Vec::new(),
            program: path.clone(),
            note: Some(format!(
                "{path} reported no tests: add TEST(...) cases and build it again"
            )),
        });
    }

    let items = pairs
        .into_iter()
        .map(|(suite, case)| TestItem {
            name: full_name(&suite, &case),
            binary: path.clone(),
            suite: GTEST_SUITE.to_string(),
        })
        .collect();
    Ok(GtestList {
        items,
        program: path,
        note: None,
    })
}

/// A program that rejected `--gtest_list_tests`: named, with its first output line, so the dock can
/// say what was asked instead of showing an empty list.
pub fn not_gtest_error(program: &str, preset: &str, captured: &Captured) -> String {
    let detail = captured
        .lines
        .iter()
        .find(|line| line.stderr && !line.text.trim().is_empty())
        .or_else(|| {
            captured
                .lines
                .iter()
                .find(|line| !line.text.trim().is_empty())
        })
        .map(|line| truncate(line.text.trim(), ERROR_LINE_LIMIT))
        .unwrap_or_else(|| "it printed nothing".to_string());
    format!(
        "{program} is not a GoogleTest binary: --gtest_list_tests {}: {detail} (run configuration \"{preset}\")",
        status_label(&captured.status)
    )
}

/// `exited with code N`, or the signal a terminated child reported.
pub fn status_label(status: &ExitStatus) -> String {
    match status.code() {
        Some(code) => format!("exited with code {code}"),
        None => "was terminated by a signal".to_string(),
    }
}
