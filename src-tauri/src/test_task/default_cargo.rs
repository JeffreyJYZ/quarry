#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{ProjectKind, TestItem, TestReport};
pub use std::io::{BufRead, BufReader, Read};
pub use std::process::{ExitStatus, Stdio};
pub use std::sync::{Arc, Mutex};
pub use std::thread;
pub use std::time::{Duration, Instant};

use super::*;

/// Program used when the environment does not name one; rustup installs it as a shim.
pub const DEFAULT_CARGO: &str = "cargo";

/// Environment variable cargo sets for build scripts and that rustup honours.
pub const CARGO_ENV: &str = "CARGO";

/// Hard limit on discovery: `--list` compiles the workspace before it lists anything.
pub const LIST_TIMEOUT: Duration = Duration::from_secs(120);

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

/// Suffix cargo prints for an ordinary test in `--format terse`.
pub const TEST_SUFFIX: &str = ": test";

#[tauri::command]
pub async fn list_tests(root: String) -> Result<Vec<TestItem>, String> {
    tauri::async_runtime::spawn_blocking(move || list(&root))
        .await
        .map_err(|error| format!("test discovery task failed: {error}"))?
}

#[tauri::command]
pub async fn run_test(root: String, name: String) -> Result<TestReport, String> {
    tauri::async_runtime::spawn_blocking(move || run(&root, &name))
        .await
        .map_err(|error| format!("test run task failed: {error}"))?
}

/// Detection and the cargo run both touch the filesystem, so both run off the async runtime.
pub fn list(root: &str) -> Result<Vec<TestItem>, String> {
    let info = project::inspect(root)?;
    require_cargo(info.kind)?;

    let captured = capture(
        "list tests",
        &info.build_root,
        &["test", "--", "--list", "--format", "terse"],
        LIST_TIMEOUT,
    )?;

    let items = parse_tests(&merged_text(&captured.lines), &info.name);
    if items.is_empty() && !captured.status.success() {
        return Err(failure_error(
            "list tests",
            &info.build_root,
            &captured.lines,
        ));
    }
    Ok(items)
}

/// A failing test is a report with `passed: false`; only a spawn failure or a timeout is `Err`.
pub fn run(root: &str, name: &str) -> Result<TestReport, String> {
    let info = project::inspect(root)?;
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
