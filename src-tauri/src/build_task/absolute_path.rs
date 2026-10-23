#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
pub use serde_json::Value;
pub use std::collections::HashSet;
pub use std::path::Path;
pub use std::process::Command;
pub use std::time::Instant;

use super::*;

/// Cargo reports paths relative to the build root; the UI keys diagnostics by file name.
pub fn absolute_path(span: &Value, build_root: &Path) -> String {
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
pub fn span_range(span: &Value) -> Range {
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
pub fn offset(value: u64) -> u32 {
    u32::try_from(value.saturating_sub(1)).unwrap_or(u32::MAX)
}

/// The LSP severity scale: 1 error, 2 warning, 3 information, 4 hint.
pub fn severity(level: &str) -> u8 {
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
pub fn summarize(stderr: &str, unlocated: &[String]) -> String {
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

pub fn truncate(text: &str, limit: usize) -> String {
    text.chars().take(limit).collect()
}

/// Builds a CMake project: configure the build root when it holds no generator file, then build.
///
/// A failing configure or build is a result, not an error: only a missing `cmake` or a failed
/// spawn is `Err`.
pub fn run_cmake_build(
    source_root: &str,
    build_root: &str,
    release: bool,
) -> Result<BuildReport, String> {
    let started = Instant::now();
    let mut text = String::new();
    let mut success = true;

    if !cmake_configured(Path::new(build_root)) {
        let outcome = run_cmake(&cmake_configure_argv(source_root, build_root), build_root)?;
        text.push_str(&outcome.text);
        success = outcome.success;
    }

    if success {
        let outcome = run_cmake(&cmake_build_argv(build_root, release), build_root)?;
        text.push_str(&outcome.text);
        success = outcome.success;
    }

    let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    Ok(BuildReport {
        success,
        diagnostics: parse_text_diagnostics(&text, Path::new(build_root)),
        duration_ms,
        summary: summarize_text(&text),
        artifact: None,
    })
}

/// True when the build root already holds a generator file, so configuring again is pointless.
pub fn cmake_configured(build_root: &Path) -> bool {
    CMAKE_GENERATOR_FILES
        .iter()
        .any(|name| build_root.join(name).is_file())
}

/// `cmake -S <source> -B <build root> -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`.
pub fn cmake_configure_argv(source_root: &str, build_root: &str) -> Vec<String> {
    vec![
        CMAKE_PROGRAM.to_string(),
        "-S".to_string(),
        source_root.to_string(),
        "-B".to_string(),
        build_root.to_string(),
        "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON".to_string(),
    ]
}

/// `cmake --build <build root> --config <Debug|Release>`.
pub fn cmake_build_argv(build_root: &str, release: bool) -> Vec<String> {
    vec![
        CMAKE_PROGRAM.to_string(),
        "--build".to_string(),
        build_root.to_string(),
        "--config".to_string(),
        cmake_config(release).to_string(),
    ]
}
