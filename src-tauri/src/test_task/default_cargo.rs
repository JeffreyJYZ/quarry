#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{ProjectInfo, ProjectKind, TestItem, TestReport};
pub use std::io::{BufRead, BufReader, Read};
pub use std::process::{Command, ExitStatus, Stdio};
pub use std::sync::{Arc, Mutex};
pub use std::thread;
pub use std::time::{Duration, Instant};

use super::*;

/// Program used when the environment does not name one; rustup installs it as a shim.
pub const DEFAULT_CARGO: &str = "cargo";

/// Environment variable cargo sets for build scripts and that rustup honours.
pub const CARGO_ENV: &str = "CARGO";

/// Hard limit on discovery: the build behind `--no-run` compiles the workspace first.
pub const LIST_TIMEOUT: Duration = Duration::from_secs(120);

/// Hard limit on one built test binary answering `--list`; it does not compile anything.
pub const EXE_LIST_TIMEOUT: Duration = Duration::from_secs(20);

/// Hard limit on one test run, which may also compile before it executes.
pub const RUN_TIMEOUT: Duration = Duration::from_secs(300);

/// Poll interval while waiting for cargo; short enough to keep stop latency imperceptible.
pub const WAIT_INTERVAL: Duration = Duration::from_millis(25);

/// Prefixes of cargo's download chatter, which the panel never needs repeated.
pub const NOISE_PREFIXES: [&str; 6] = [
    "Downloading",
    "Downloaded",
    "Updating",
    "Adding",
    "Locking",
    "Blocking waiting",
];

/// Lines of run output kept for the panel; the whole log is never shipped to the frontend.
pub const OUTPUT_LINE_LIMIT: usize = 200;

/// A failing command's detail line is one line, and a cargo error block can be a paragraph.
pub const ERROR_LINE_LIMIT: usize = 300;

/// Suite label for a Cargo test, shown next to the binary group in the dock.
pub const CARGO_SUITE: &str = "cargo";

/// Suffix cargo prints for an ordinary test in `--format terse`.
pub const TEST_SUFFIX: &str = ": test";

/// Discovery for a Cargo project, one listing per test binary.
///
/// `cargo test --no-run --message-format=json` builds every test target and names its source file
/// and executable, and each executable then answers `--list --format terse` itself. Asking the
/// binaries directly is what makes the label honest: a single `cargo test -- --list` run prints its
/// `Running unittests …` / `Running tests/…` headers on unbuffered stderr while the names leave
/// buffered stdout, so a merged stream attributes every name to whichever header the merge happened
/// to put first. One binary's own output has no header to merge with.
pub fn list(info: &ProjectInfo) -> Result<Vec<TestItem>, String> {
    require_cargo(info.kind)?;

    let built = capture(
        "list tests",
        &info.build_root,
        &["test", "--no-run", "--message-format=json"],
        LIST_TIMEOUT,
    )?;
    let binaries = test_binaries(&stdout_text(&built.lines), &info.build_root);
    if binaries.is_empty() {
        if !built.status.success() {
            return Err(failure_error("list tests", &info.build_root, &built.lines));
        }
        return Ok(Vec::new());
    }

    let mut items = Vec::new();
    for binary in &binaries {
        let listed = capture_program(
            "list tests",
            &info.build_root,
            &binary.executable,
            &["--list", "--format", "terse"],
            EXE_LIST_TIMEOUT,
        )?;
        items.extend(parse_tests(&stdout_text(&listed.lines), &binary.label));
    }
    Ok(items)
}

/// A failing test is a report with `passed: false`; only a spawn failure or a timeout is `Err`.
pub fn run_for(info: &ProjectInfo, name: &str) -> Result<TestReport, String> {
    require_cargo(info.kind)?;

    let started = Instant::now();
    let captured = capture(
        "run a test",
        &info.build_root,
        &["test", name, "--", "--exact", "--nocapture"],
        RUN_TIMEOUT,
    )?;
    let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);

    Ok(TestReport {
        name: name.to_string(),
        passed: captured.status.success(),
        output: tail_output(&line_texts(&captured.lines)),
        duration_ms,
    })
}

/// Only Cargo projects are wired in this slice; the other kinds must say so rather than guess.
pub fn require_cargo(kind: ProjectKind) -> Result<(), String> {
    if kind == ProjectKind::Cargo {
        return Ok(());
    }
    Err(format!(
        "tests are only wired for Cargo projects: detected {}",
        kind_label(kind)
    ))
}

pub fn kind_label(kind: ProjectKind) -> &'static str {
    match kind {
        ProjectKind::Cargo => "Cargo",
        ProjectKind::Cmake => "CMake",
        ProjectKind::CompileCommands => "compile_commands.json",
        ProjectKind::Unknown => "no build system",
    }
}

/// One captured output line and the stream it arrived on.
#[derive(Clone, Debug)]
pub struct Line {
    pub(crate) text: String,
    pub(crate) stderr: bool,
}
