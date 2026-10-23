//! Test discovery and single-test runs.
//!
//! Discovery runs `cargo test -- --list --format terse` in the project's build root and parses the
//! `path::name: test` lines; each name takes the test binary from the closest preceding `Running …`
//! header, or the crate name when no header was seen. Running one test uses
//! `cargo test <name> -- --exact --nocapture`.
//!
//! Neither command builds ahead of time, so either may compile: a discovery run is killed after
//! `LIST_TIMEOUT` and a test run after `RUN_TIMEOUT`. A failing test, or a non-zero exit that still
//! produced parseable output, is a result rather than a command error. Nothing is written to disk.

use crate::project;
use crate::types::{ProjectKind, TestItem, TestReport};
use std::io::{BufRead, BufReader, Read};
use std::process::{ExitStatus, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

/// Program used when the environment does not name one; rustup installs it as a shim.
const DEFAULT_CARGO: &str = "cargo";
/// Environment variable cargo sets for build scripts and that rustup honours.
const CARGO_ENV: &str = "CARGO";
/// Hard limit on discovery: `--list` compiles the workspace before it lists anything.
const LIST_TIMEOUT: Duration = Duration::from_secs(120);
/// Hard limit on one test run, which may also compile before it executes.
const RUN_TIMEOUT: Duration = Duration::from_secs(300);
/// Poll interval while waiting for cargo; short enough to keep stop latency imperceptible.
const WAIT_INTERVAL: Duration = Duration::from_millis(25);
/// Prefixes of cargo's download chatter, which the panel never needs repeated.
const NOISE_PREFIXES: [&str; 6] = [
    "Downloading",
    "Downloaded",
    "Updating",
    "Adding",
    "Locking",
    "Blocking waiting",
];
/// Lines of run output kept for the panel; the whole log is never shipped to the frontend.
const OUTPUT_LINE_LIMIT: usize = 200;
/// A failing command's detail line is one line, and a cargo error block can be a paragraph.
const ERROR_LINE_LIMIT: usize = 300;
/// Suffix cargo prints for an ordinary test in `--format terse`.
const TEST_SUFFIX: &str = ": test";

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
fn list(root: &str) -> Result<Vec<TestItem>, String> {
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
fn run(root: &str, name: &str) -> Result<TestReport, String> {
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
fn require_cargo(kind: ProjectKind) -> Result<(), String> {
    if kind == ProjectKind::Cargo {
        return Ok(());
    }
    Err(format!(
        "tests are only wired for Cargo projects: detected {}",
        kind_label(kind)
    ))
}

fn kind_label(kind: ProjectKind) -> &'static str {
    match kind {
        ProjectKind::Cargo => "Cargo",
        ProjectKind::Cmake => "CMake",
        ProjectKind::CompileCommands => "compile_commands.json",
        ProjectKind::Unknown => "no build system",
    }
}

/// One captured output line and the stream it arrived on.
#[derive(Clone, Debug)]
struct Line {
    text: String,
    stderr: bool,
}

/// A finished run: the exit status plus every line in arrival order.
///
/// The two pipes are drained by threads of their own, so a large log never fills a pipe buffer and
/// stalls the child, and the relative order of the streams is preserved closely enough to attribute
/// a `Running …` header to the tests that follow it.
struct Captured {
    status: ExitStatus,
    lines: Vec<Line>,
}

/// Runs cargo with the given arguments and kills it once `timeout` elapses.
fn capture(
    operation: &str,
    build_root: &str,
    args: &[&str],
    timeout: Duration,
) -> Result<Captured, String> {
    let program = cargo_program();
    let mut child = crate::resolve::command(&program)?
        .current_dir(build_root)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            format!("cannot {operation} in {build_root}: cannot start {program}: {error}")
        })?;

    let sink: Arc<Mutex<Vec<Line>>> = Arc::new(Mutex::new(Vec::new()));
    let stdout = child
        .stdout
        .take()
        .map(|stream| spawn_reader(stream, false, &sink));
    let stderr = child
        .stderr
        .take()
        .map(|stream| spawn_reader(stream, true, &sink));

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {}
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "cannot {operation} in {build_root}: waiting for {program} failed: {error}"
                ));
            }
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            break None;
        }
        thread::sleep(WAIT_INTERVAL);
    };

    for reader in [stdout, stderr].into_iter().flatten() {
        let _ = reader.join();
    }

    let Some(status) = status else {
        return Err(timeout_error(operation, timeout));
    };
    let lines = sink
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .clone();
    Ok(Captured { status, lines })
}

/// Drains one pipe into the shared sink until the child closes it.
fn spawn_reader<R>(stream: R, stderr: bool, sink: &Arc<Mutex<Vec<Line>>>) -> thread::JoinHandle<()>
where
    R: Read + Send + 'static,
{
    let sink = Arc::clone(sink);
    thread::spawn(move || {
        let mut reader = BufReader::new(stream);
        let mut buffer = Vec::new();
        loop {
            buffer.clear();
            match reader.read_until(b'\n', &mut buffer) {
                Ok(0) | Err(_) => return,
                Ok(_) => {
                    let line = String::from_utf8_lossy(&buffer);
                    let text = line.trim_end_matches(['\n', '\r']).to_string();
                    let mut lines = sink.lock().unwrap_or_else(|error| error.into_inner());
                    lines.push(Line { text, stderr });
                }
            }
        }
    })
}

/// `CARGO` from the environment when set, else the shim on `PATH`.
fn cargo_program() -> String {
    std::env::var(CARGO_ENV)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_CARGO.to_string())
}

/// Both streams joined in arrival order, for the line-oriented parsers.
fn merged_text(lines: &[Line]) -> String {
    line_texts(lines).join("\n")
}

fn line_texts(lines: &[Line]) -> Vec<String> {
    lines.iter().map(|line| line.text.clone()).collect()
}

/// Parses `--list --format terse` output: `path::name: test` lines, deduplicated by name.
///
/// `: bench` lines and anything that does not end in `: test` are ignored, and an inner `::` stays
/// part of the name. Each name takes the label of the closest preceding `Running unittests …` or
/// `Running tests/…` header, falling back to the crate name for tests listed before any header.
fn parse_tests(merged: &str, crate_name: &str) -> Vec<TestItem> {
    let mut binary = crate_name.to_string();
    let mut seen = std::collections::HashSet::new();
    let mut items = Vec::new();

    for line in merged.lines() {
        let line = line.trim();
        if let Some(header) = running_header(line) {
            binary = header.to_string();
            continue;
        }
        let Some(name) = test_name(line) else {
            continue;
        };
        if !seen.insert(name.clone()) {
            continue;
        }
        items.push(TestItem {
            name,
            binary: binary.clone(),
        });
    }

    items
}

/// The binary label of a cargo `Running …` header: the source path, when one is named.
fn running_header(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("Running ")?;
    let rest = rest
        .strip_prefix("unittests ")
        .or_else(|| rest.strip_prefix("tests "))?;
    rest.split_whitespace()
        .next()
        .filter(|label| !label.is_empty())
        .or(Some(rest.trim()))
}

/// The test name on a line ending in `: test`; `: bench`, `: test extra` and prose yield nothing.
fn test_name(line: &str) -> Option<String> {
    let name = line.strip_suffix(TEST_SUFFIX)?;
    if name.is_empty() {
        return None;
    }
    Some(name.to_string())
}

/// Last `OUTPUT_LINE_LIMIT` lines, with repeats of cargo's download chatter dropped.
fn tail_output(lines: &[String]) -> String {
    let mut seen_noise = std::collections::HashSet::new();
    let kept: Vec<&str> = lines
        .iter()
        .map(String::as_str)
        .filter(|line| !is_noise(line) || seen_noise.insert(*line))
        .collect();
    let start = kept.len().saturating_sub(OUTPUT_LINE_LIMIT);
    kept[start..].join("\n")
}

fn is_noise(line: &str) -> bool {
    let line = line.trim_start();
    NOISE_PREFIXES.iter().any(|prefix| line.starts_with(prefix))
}

/// The command's own name, its build root and cargo's first stderr line, in one short string.
fn failure_error(operation: &str, build_root: &str, lines: &[Line]) -> String {
    let detail = lines
        .iter()
        .find(|line| line.stderr && !line.text.trim().is_empty())
        .map(|line| truncate(line.text.trim(), ERROR_LINE_LIMIT))
        .unwrap_or_else(|| "cargo reported no output".to_string());
    format!("cannot {operation} in {build_root}: {detail}")
}

fn timeout_error(operation: &str, timeout: Duration) -> String {
    format!(
        "{operation} timed out after {} s: cargo was killed",
        timeout.as_secs()
    )
}

fn truncate(text: &str, limit: usize) -> String {
    text.chars().take(limit).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Cargo chatter, a test listed before any header, a duplicated name, a bench line and an inner
    /// `::` both appear; the header re-points the binary for the names after it.
    const LIST_FIXTURE: &str = concat!(
        "    Finished `test` profile [unoptimized + debuginfo] target(s) in 1.02s\n",
        "prelude::tests::before_any_header: test\n",
        "     Running unittests src/lib.rs (target/debug/deps/quarry_lib-abc123)\n",
        "protocol_pipe::tests::roundtrip: test\n",
        "protocol_pipe::benches::throughput: bench\n",
        "protocol_pipe::tests::roundtrip: test\n",
        "build_task::tests::inner::helper: test\n",
        "suffix::tests::not_a_test: test extra\n",
        "not a test line at all\n",
    );

    #[test]
    fn parse_tests_reads_test_lines_and_attributes_the_header() {
        let items = parse_tests(LIST_FIXTURE, "quarry");

        let names: Vec<&str> = items.iter().map(|item| item.name.as_str()).collect();
        assert_eq!(
            names,
            [
                "prelude::tests::before_any_header",
                "protocol_pipe::tests::roundtrip",
                "build_task::tests::inner::helper",
            ],
            "bench, duplicates and non-test lines must not appear"
        );

        assert_eq!(items[0].binary, "quarry");
        assert_eq!(items[1].binary, "src/lib.rs");
        assert_eq!(items[2].binary, "src/lib.rs");
    }

    #[test]
    fn parse_tests_without_a_header_uses_the_crate_name() {
        let merged = concat!(
            "alpha::tests::one: test\n",
            "alpha::benches::hot: bench\n",
            "beta::tests::two: test\n",
        );

        let items = parse_tests(merged, "demo");

        assert_eq!(items.len(), 2);
        assert!(items.iter().all(|item| item.binary == "demo"));
        assert_eq!(items[1].name, "beta::tests::two");
    }

    #[test]
    fn parse_tests_of_empty_output_is_empty() {
        assert!(parse_tests("", "demo").is_empty());
        assert!(parse_tests("only::benches::here: bench\n", "demo").is_empty());
    }

    #[test]
    fn tail_output_keeps_the_last_two_hundred_lines() {
        let lines: Vec<String> = (0..250).map(|index| format!("line {index}")).collect();

        let output = tail_output(&lines);
        let kept: Vec<&str> = output.lines().collect();

        assert_eq!(kept.len(), OUTPUT_LINE_LIMIT);
        assert_eq!(kept.first(), Some(&"line 50"));
        assert_eq!(kept.last(), Some(&"line 249"));
    }

    #[test]
    fn tail_output_drops_repeated_download_noise_only() {
        let lines: Vec<String> = [
            "   Downloading crates ...",
            "   Downloading crates ...",
            "    Compiling quarry v0.1.0",
            "  Downloaded serde v1.0.0",
            "  Downloaded serde v1.0.0",
            "kept",
            "kept",
        ]
        .iter()
        .map(|line| (*line).to_string())
        .collect();

        assert_eq!(
            tail_output(&lines),
            "   Downloading crates ...\n    Compiling quarry v0.1.0\n  Downloaded serde v1.0.0\nkept\nkept"
        );
    }

    #[test]
    fn timeout_error_names_the_operation_and_the_limit() {
        let discovery = timeout_error("list tests", LIST_TIMEOUT);
        assert!(discovery.contains("list tests"), "unexpected: {discovery}");
        assert!(discovery.contains("timed out"), "unexpected: {discovery}");
        assert!(discovery.contains("120 s"), "unexpected: {discovery}");

        let run = timeout_error("run a test", RUN_TIMEOUT);
        assert!(run.contains("300 s"), "unexpected: {run}");
    }

    #[test]
    fn failure_error_uses_the_first_stderr_line_truncated() {
        let lines = vec![
            Line {
                text: "    Finished `test` profile".to_string(),
                stderr: true,
            },
            Line {
                text: "error: could not compile `quarry`".to_string(),
                stderr: true,
            },
        ];
        assert_eq!(
            failure_error("list tests", "/projects/demo", &lines),
            "cannot list tests in /projects/demo: Finished `test` profile"
        );

        let long = vec![Line {
            text: "e".repeat(ERROR_LINE_LIMIT + 100),
            stderr: true,
        }];
        let error = failure_error("run a test", "/projects/demo", &long);
        assert_eq!(
            error,
            format!(
                "cannot run a test in /projects/demo: {}",
                "e".repeat(ERROR_LINE_LIMIT)
            )
        );
    }

    #[test]
    fn only_cargo_projects_are_supported() {
        assert!(require_cargo(ProjectKind::Cargo).is_ok());

        for (kind, label) in [
            (ProjectKind::Cmake, "CMake"),
            (ProjectKind::CompileCommands, "compile_commands.json"),
            (ProjectKind::Unknown, "no build system"),
        ] {
            let error = require_cargo(kind).expect_err("non-Cargo kinds are not wired");
            assert!(error.contains(label), "unexpected error: {error}");
            assert!(
                error.contains("Cargo projects"),
                "unexpected error: {error}"
            );
        }
    }
}
