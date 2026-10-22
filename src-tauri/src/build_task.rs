//! Build runner and compiler diagnostics.
//!
//! Runs `cargo build --message-format=json` in the project's build root, turns the machine-readable
//! stream into `Diagnostic`s and returns a `BuildReport`. Cargo only in this slice — CMake and
//! `compile_commands.json` projects return an honest error instead of guessing a build command.
//!
//! A failing build is a result, not a command error: only a spawn failure or an unsupported project
//! kind is `Err`. The build never runs the program and never writes into the source tree.

use crate::project;
use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
use serde_json::Value;
use std::path::Path;
use std::process::Command;
use std::time::Instant;

/// Program used when the environment does not name one; rustup installs it as a shim.
const DEFAULT_CARGO: &str = "cargo";
/// Environment variable cargo sets for build scripts and that rustup honours.
const CARGO_ENV: &str = "CARGO";
/// Diagnostics from a build carry a single source, so the panel can label them.
const SOURCE: &str = "cargo";
/// Status-bar summary limit; cargo's last stderr line can be a whole error block.
const SUMMARY_LIMIT: usize = 200;
const DEFAULT_SUMMARY: &str = "cargo build succeeded";

/// `profile` is `debug` or `release`; anything else is an error naming the accepted values.
#[tauri::command]
pub async fn build_project(root: String, profile: String) -> Result<BuildReport, String> {
    let release = release_for(&profile)?;
    tauri::async_runtime::spawn_blocking(move || build(&root, release))
        .await
        .map_err(|error| format!("build task failed: {error}"))?
}

/// Detection and the build both touch the filesystem, so both run off the async runtime.
fn build(root: &str, release: bool) -> Result<BuildReport, String> {
    let info = project::inspect(root)?;
    require_cargo(info.kind)?;
    run_build(&info.build_root, release)
}

/// Maps the wire profile onto cargo's `--release` flag.
fn release_for(profile: &str) -> Result<bool, String> {
    match profile {
        "debug" => Ok(false),
        "release" => Ok(true),
        other => Err(format!(
            "unsupported build profile {other:?}: expected \"debug\" or \"release\""
        )),
    }
}

/// Only Cargo builds are wired in this slice; the C/C++ kinds must say so rather than guess.
fn require_cargo(kind: ProjectKind) -> Result<(), String> {
    match kind {
        ProjectKind::Cargo => Ok(()),
        ProjectKind::Cmake => Err(cpp_not_wired("CMakeLists.txt")),
        ProjectKind::CompileCommands => Err(cpp_not_wired("compile_commands.json")),
        ProjectKind::Unknown => Err(
            "no build system detected in this project: only Cargo projects build in this slice"
                .to_string(),
        ),
    }
}

fn cpp_not_wired(marker: &str) -> String {
    format!(
        "C/C++ builds are not wired yet (detected {marker}): only Cargo projects build in this slice"
    )
}

/// Runs the build and reports. Called on a blocking thread so the async runtime stays free.
fn run_build(build_root: &str, release: bool) -> Result<BuildReport, String> {
    let started = Instant::now();
    let program = cargo_program();

    let mut command = Command::new(&program);
    command
        .current_dir(build_root)
        .arg("build")
        .arg("--message-format=json");
    if release {
        command.arg("--release");
    }

    let output = command
        .output()
        .map_err(|error| format!("cannot run {program} in {build_root}: {error}"))?;
    let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let parsed = parse_cargo_json(&stdout, Path::new(build_root));

    Ok(BuildReport {
        success: parsed.success.unwrap_or_else(|| output.status.success()),
        diagnostics: parsed.diagnostics,
        duration_ms,
        summary: summarize(&stderr, &parsed.unlocated),
    })
}

/// `CARGO` from the environment when set, else the shim on `PATH`.
fn cargo_program() -> String {
    std::env::var(CARGO_ENV)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_CARGO.to_string())
}

/// Parsed form of cargo's JSON stream: what the report needs, and nothing else.
struct ParsedBuild {
    diagnostics: Vec<Diagnostic>,
    /// Set by `build-finished`; `None` means the stream ended early and the exit status decides.
    success: Option<bool>,
    /// Compiler messages with no file to point at, kept for the fallback summary.
    unlocated: Vec<String>,
}

/// One line of the stream.
enum ParsedLine {
    Diagnostics(Vec<Diagnostic>),
    /// A compiler message without a span carrying a file name: no diagnostic, but it names a failure.
    Unlocated(String),
    /// `build-finished`: the authoritative verdict.
    Finished(bool),
    /// Non-JSON chatter, or a reason this slice does not use.
    Ignored,
}

fn parse_cargo_json(stdout: &str, build_root: &Path) -> ParsedBuild {
    let mut parsed = ParsedBuild {
        diagnostics: Vec::new(),
        success: None,
        unlocated: Vec::new(),
    };

    for line in stdout.lines() {
        match parse_message_line(line, build_root) {
            ParsedLine::Diagnostics(diagnostics) => parsed.diagnostics.extend(diagnostics),
            ParsedLine::Unlocated(text) => parsed.unlocated.push(text),
            ParsedLine::Finished(success) => parsed.success = Some(success),
            ParsedLine::Ignored => {}
        }
    }

    parsed
}

/// Parses a single line, tolerating the non-JSON lines cargo interleaves with the stream.
fn parse_message_line(line: &str, build_root: &Path) -> ParsedLine {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return ParsedLine::Ignored;
    };

    match value["reason"].as_str() {
        Some("compiler-message") => {
            let message = &value["message"];
            let diagnostics = diagnostics_for(message, build_root);
            if diagnostics.is_empty() {
                let text = message["message"].as_str().unwrap_or_default();
                return ParsedLine::Unlocated(text.to_string());
            }
            ParsedLine::Diagnostics(diagnostics)
        }
        Some("build-finished") => ParsedLine::Finished(value["success"].as_bool().unwrap_or(false)),
        _ => ParsedLine::Ignored,
    }
}

/// The diagnostic's own message, plus any error or warning child, all at the anchor span.
fn diagnostics_for(message: &Value, build_root: &Path) -> Vec<Diagnostic> {
    let Some(anchor) = anchor_span(message, build_root) else {
        return Vec::new();
    };

    let level = message["level"].as_str().unwrap_or_default();
    let text = message["message"].as_str().unwrap_or_default();
    let mut diagnostics = vec![diagnostic_at(&anchor, severity(level), text.to_string())];

    for child in message["children"].as_array().into_iter().flatten() {
        let child_level = child["level"].as_str().unwrap_or_default();
        if !matches!(child_level, "error" | "warning") {
            continue;
        }
        let child_text = child["message"].as_str().unwrap_or_default();
        diagnostics.push(diagnostic_at(
            &anchor,
            severity(child_level),
            format!("{child_level}: {child_text}"),
        ));
    }

    diagnostics
}

/// Where a message points: an absolute path and a zero-based, end-exclusive range.
struct Anchor {
    path: String,
    range: Range,
}

/// Prefers the primary span, falls back to the first span that names a file; `None` when none does.
fn anchor_span(message: &Value, build_root: &Path) -> Option<Anchor> {
    let spans = message["spans"].as_array()?;
    let located = |span: &&Value| {
        span["file_name"]
            .as_str()
            .is_some_and(|name| !name.is_empty())
    };
    let primary = |span: &&Value| span["is_primary"].as_bool() == Some(true);

    let span = spans
        .iter()
        .find(|span| primary(span) && located(span))
        .or_else(|| spans.iter().find(located))?;
    Some(Anchor {
        path: absolute_path(span, build_root),
        range: span_range(span),
    })
}

fn diagnostic_at(anchor: &Anchor, severity: u8, message: String) -> Diagnostic {
    Diagnostic {
        path: anchor.path.clone(),
        range: anchor.range,
        severity,
        message,
        source: Some(SOURCE.to_string()),
    }
}

/// Cargo reports paths relative to the build root; the UI keys diagnostics by file name.
fn absolute_path(span: &Value, build_root: &Path) -> String {
    let file_name = span["file_name"].as_str().unwrap_or_default();
    let path = Path::new(file_name);
    let resolved = if path.is_absolute() {
        path.to_path_buf()
    } else {
        build_root.join(path)
    };
    resolved.to_string_lossy().into_owned()
}

/// Cargo lines and columns are 1-based and the end column is inclusive; LSP is zero-based and the
/// end is exclusive, so the end comes out as `column_end - 1`.
fn span_range(span: &Value) -> Range {
    let line = offset(span["line_start"].as_u64().unwrap_or(1));
    let character = offset(span["column_start"].as_u64().unwrap_or(1));
    let end_line = span["line_end"].as_u64().map_or(line, offset);
    let end_character = span["column_end"]
        .as_u64()
        .map_or(character.saturating_add(1), offset);

    Range {
        start: Position { line, character },
        end: Position {
            line: end_line,
            character: end_character,
        },
    }
}

/// 1-based wire value to a 0-based offset, tolerating a missing or zero value.
fn offset(value: u64) -> u32 {
    u32::try_from(value.saturating_sub(1)).unwrap_or(u32::MAX)
}

/// The LSP severity scale: 1 error, 2 warning, 3 information, 4 hint.
fn severity(level: &str) -> u8 {
    match level {
        "error" | "error: internal compiler error" => 1,
        "warning" => 2,
        "help" | "failure-note" => 4,
        _ => 3,
    }
}

/// Last non-empty stderr line, truncated for the status bar.
///
/// A message with no span never reaches stderr in some cargo versions, so its text is the fallback.
fn summarize(stderr: &str, unlocated: &[String]) -> String {
    let last_stderr = stderr.lines().rev().find(|line| !line.trim().is_empty());
    let text = match last_stderr {
        Some(line) => line.trim(),
        None => unlocated
            .last()
            .map(String::as_str)
            .unwrap_or(DEFAULT_SUMMARY),
    };
    truncate(text, SUMMARY_LIMIT)
}

fn truncate(text: &str, limit: usize) -> String {
    text.chars().take(limit).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const BUILD_ROOT: &str = "/projects/demo";

    fn build_root() -> &'static Path {
        Path::new(BUILD_ROOT)
    }

    fn only_diagnostic(line: &str) -> Diagnostic {
        match parse_message_line(line, build_root()) {
            ParsedLine::Diagnostics(mut diagnostics) => {
                assert_eq!(diagnostics.len(), 1, "expected exactly one diagnostic");
                diagnostics.remove(0)
            }
            _ => panic!("expected a diagnostic line"),
        }
    }

    /// Warning with a primary span at line 7, column 5: zero-based line 6, character 4.
    #[test]
    fn warning_with_primary_span_converts_to_zero_based() {
        let line = r#"{"reason":"compiler-message","message":{"level":"warning","message":"unused variable: `x`","spans":[{"file_name":"src/main.rs","line_start":7,"line_end":7,"column_start":5,"column_end":10,"is_primary":true}],"children":[]}}"#;

        let diagnostic = only_diagnostic(line);

        assert_eq!(diagnostic.path, format!("{BUILD_ROOT}/src/main.rs"));
        assert_eq!(
            diagnostic.range,
            Range {
                start: Position {
                    line: 6,
                    character: 4
                },
                end: Position {
                    line: 6,
                    character: 9
                },
            }
        );
        assert_eq!(diagnostic.severity, 2);
        assert_eq!(diagnostic.message, "unused variable: `x`");
        assert_eq!(diagnostic.source.as_deref(), Some("cargo"));
    }

    #[test]
    fn error_falls_back_to_the_first_span_when_none_is_primary() {
        let line = r#"{"reason":"compiler-message","message":{"level":"error","message":"mismatched types","spans":[{"file_name":"src/lib.rs","line_start":3,"line_end":4,"column_start":1,"column_end":2,"is_primary":false}],"children":[]}}"#;

        let diagnostic = only_diagnostic(line);

        assert_eq!(diagnostic.severity, 1);
        assert_eq!(diagnostic.path, format!("{BUILD_ROOT}/src/lib.rs"));
        assert_eq!(
            diagnostic.range,
            Range {
                start: Position {
                    line: 2,
                    character: 0
                },
                end: Position {
                    line: 3,
                    character: 1
                },
            }
        );
    }

    #[test]
    fn message_without_spans_yields_no_diagnostic() {
        let line = r#"{"reason":"compiler-message","message":{"level":"error","message":"could not compile `demo`","spans":[]}}"#;

        match parse_message_line(line, build_root()) {
            ParsedLine::Unlocated(text) => assert_eq!(text, "could not compile `demo`"),
            _ => panic!("expected the message to be unlocated"),
        }
        assert!(parse_cargo_json(line, build_root()).diagnostics.is_empty());
    }

    #[test]
    fn span_without_a_file_name_is_not_a_diagnostic() {
        let line = r#"{"reason":"compiler-message","message":{"level":"warning","message":"something","spans":[{"line_start":1,"line_end":1,"column_start":1,"column_end":2,"is_primary":true}]}}"#;

        assert!(parse_cargo_json(line, build_root()).diagnostics.is_empty());
    }

    #[test]
    fn absolute_span_paths_are_kept_and_relative_ones_joined() {
        let absolute = r#"{"reason":"compiler-message","message":{"level":"note","message":"note","spans":[{"file_name":"/elsewhere/mod.rs","line_start":1,"line_end":1,"column_start":2,"column_end":3,"is_primary":true}]}}"#;
        assert_eq!(only_diagnostic(absolute).path, "/elsewhere/mod.rs");

        let nested = r#"{"reason":"compiler-message","message":{"level":"note","message":"note","spans":[{"file_name":"crates/core/src/main.rs","line_start":1,"line_end":1,"column_start":2,"column_end":3,"is_primary":true}]}}"#;
        assert_eq!(
            only_diagnostic(nested).path,
            format!("{BUILD_ROOT}/crates/core/src/main.rs")
        );
    }

    #[test]
    fn build_finished_carries_the_verdict() {
        let finished = r#"{"reason":"build-finished","success":false}"#;

        assert!(matches!(
            parse_message_line(finished, build_root()),
            ParsedLine::Finished(false)
        ));
        assert_eq!(
            parse_cargo_json(finished, build_root()).success,
            Some(false)
        );
    }

    #[test]
    fn non_json_lines_are_skipped_without_panicking() {
        let line = "    Compiling demo v0.1.0 (/projects/demo)";
        assert!(matches!(
            parse_message_line(line, build_root()),
            ParsedLine::Ignored
        ));

        let mixed = concat!(
            "    Compiling demo v0.1.0 (/projects/demo)\n",
            r#"{"reason":"compiler-artifact","target":{"name":"demo"},"filenames":[]}"#,
            "\n",
            r#"{"reason":"build-finished","success":true}"#,
            "\n",
        );
        let parsed = parse_cargo_json(mixed, build_root());
        assert!(parsed.diagnostics.is_empty());
        assert_eq!(parsed.success, Some(true));
    }

    #[test]
    fn error_and_warning_children_become_extra_diagnostics_at_the_primary_span() {
        let line = r#"{"reason":"compiler-message","message":{"level":"error","message":"mismatched types","spans":[{"file_name":"src/main.rs","line_start":5,"line_end":5,"column_start":2,"column_end":4,"is_primary":true}],"children":[{"level":"error","message":"expected `u32`, found `&str`","spans":[]},{"level":"warning","message":"consider borrowing","spans":[]},{"level":"note","message":"ignored note","spans":[]}]}}"#;

        let ParsedLine::Diagnostics(diagnostics) = parse_message_line(line, build_root()) else {
            panic!("expected diagnostics");
        };

        assert_eq!(diagnostics.len(), 3);
        assert_eq!(diagnostics[0].severity, 1);
        assert_eq!(
            diagnostics[1].message,
            "error: expected `u32`, found `&str`"
        );
        assert_eq!(diagnostics[1].severity, 1);
        assert_eq!(diagnostics[2].message, "warning: consider borrowing");
        assert_eq!(diagnostics[2].severity, 2);
        for diagnostic in &diagnostics {
            assert_eq!(diagnostic.range, diagnostics[0].range);
            assert_eq!(diagnostic.path, diagnostics[0].path);
        }
    }

    #[test]
    fn level_mapping_follows_the_lsp_scale() {
        assert_eq!(severity("error"), 1);
        assert_eq!(severity("error: internal compiler error"), 1);
        assert_eq!(severity("warning"), 2);
        assert_eq!(severity("note"), 3);
        assert_eq!(severity("help"), 4);
        assert_eq!(severity("failure-note"), 4);
    }

    #[test]
    fn summary_is_the_last_non_empty_stderr_line_truncated() {
        let stderr = "warning: unused\n\n    Finished `dev` profile [unoptimized]\n\n";
        assert_eq!(
            summarize(stderr, &[]),
            "Finished `dev` profile [unoptimized]"
        );

        assert_eq!(summarize("  \n\n", &[]), DEFAULT_SUMMARY);
        assert_eq!(
            summarize("", &["could not compile `demo`".to_string()]),
            "could not compile `demo`"
        );

        let long = "e".repeat(SUMMARY_LIMIT + 50);
        assert_eq!(summarize(&long, &[]).chars().count(), SUMMARY_LIMIT);
    }

    #[test]
    fn profile_accepts_only_debug_and_release() {
        assert_eq!(release_for("debug"), Ok(false));
        assert_eq!(release_for("release"), Ok(true));

        let error = release_for("bench").expect_err("bench is not a profile");
        assert!(error.contains("\"debug\""), "unexpected error: {error}");
        assert!(error.contains("\"release\""), "unexpected error: {error}");
    }

    #[test]
    fn only_cargo_is_wired() {
        assert!(require_cargo(ProjectKind::Cargo).is_ok());

        for kind in [ProjectKind::Cmake, ProjectKind::CompileCommands] {
            let error = require_cargo(kind).expect_err("C/C++ is not wired");
            assert!(
                error.contains("C/C++ builds are not wired yet"),
                "unexpected error: {error}"
            );
        }
        assert!(require_cargo(ProjectKind::Unknown).is_err());
    }
}
