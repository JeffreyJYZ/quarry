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
/// When neither says anything, the exit status decides: reporting "succeeded" for a build that
/// failed is the one summary the user cannot check against the panel, which is empty too.
pub fn summarize(stderr: &str, unlocated: &[String], success: bool) -> String {
    let last_stderr = stderr.lines().rev().find(|line| !line.trim().is_empty());
    let text = match last_stderr {
        Some(line) => line.trim(),
        None => unlocated.last().map(String::as_str).unwrap_or(if success {
            DEFAULT_SUMMARY
        } else {
            FAILED_SUMMARY
        }),
    };
    truncate(text, SUMMARY_LIMIT)
}

/// CMake's compiler output names files relative to the source tree it was configured from, while
/// the build itself runs in the build directory. Resolving against the build root pointed every
/// relative diagnostic at a file that does not exist there; absolute paths are already the answer.
pub fn cmake_diagnostics(text: &str, source_root: &str) -> Vec<Diagnostic> {
    parse_text_diagnostics(text, Path::new(source_root))
}

pub fn truncate(text: &str, limit: usize) -> String {
    text.chars().take(limit).collect()
}

/// Builds a CMake project the way the project's own configuration says: pick the tree, configure
/// through its preset when it has one, then build that tree.
///
/// Configure only when the tree is stale — a manifest, a preset or a toolchain file the last
/// configure read has changed, or the tree has never been configured — so a build with nothing to
/// reload goes straight to the compiler and one note says a reload happened.
///
/// A failing configure or build is a result, not an error: only a missing `cmake` or a failed
/// spawn is `Err`.
pub fn run_cmake_build(
    state: &BuildState,
    source_root: &str,
    release: bool,
) -> Result<BuildReport, String> {
    let source = Path::new(source_root);
    let plan = cmake_plan(source, release, &CmakeOptions::for_root(source))?;
    let started = Instant::now();
    let started_at = SystemTime::now();
    // Notes are collected rather than appended as they happen: the status bar reports the last line,
    // which must stay the compiler's own verdict, so every note precedes the output it describes.
    let mut notes: Vec<String> = plan.note.iter().cloned().collect();

    // A configure is what turns the manifest into build rules and a model, so it runs when that
    // input changed and not merely because a build was asked for: an unchanged tree goes straight
    // to the compiler. The note has to precede the output it explains, hence the collection above.
    let need = configure_need(source, &plan.build_root, &plan.intent);
    let reconfigured = matches!(need, Some(ConfigureNeed::Changed(_)));
    if let Some(ConfigureNeed::Changed(note)) = &need {
        notes.push(note.clone());
    }

    let mut body = String::new();
    let mut success = true;
    let mut stopped = false;
    let mut configured = false;

    if need.is_some() {
        // The query has to exist before the configure that answers it: CMake writes only the
        // objects a client asked for, and it reads the query once, as the configure starts.
        if let Err(error) = write_query(&plan.build_root) {
            notes.push(error);
        }

        // Both steps run from the project root: `--preset` is looked up against the working
        // directory, while an absolute `--build <path>` does not care where it starts.
        let configure = run_cmake(state, &plan.configure, source_root)?;
        body.push_str(&configure.text);
        success = configure.success;
        stopped = configure.stopped;
        configured = true;

        // The reply and the model on disk are the last configure that succeeded, so a failure here
        // says so instead of letting the old targets pass for current ones. The database is left
        // alone: a half-built model, or none, is worse for analysis than the previous one.
        if !success && !stopped && reconfigured {
            notes.push(format!(
                "the configure failed, so {} still holds the model of its last successful configure",
                plan.build_root.display()
            ));
        }
    }

    if success && !stopped {
        // Read only after a configure that succeeded: a failed one can leave a reply half written,
        // and a database built from half a project is worse than the previous one still on disk.
        if configured {
            match synthesize_database(&plan.build_root) {
                Ok(Some(written)) => notes.push(written.note()),
                Ok(None) => {}
                Err(why) => notes.push(format!(
                    "no compiler database from the CMake file API: {why}"
                )),
            }
        }
        let outcome = run_cmake(state, &plan.build, source_root)?;
        body.push_str(&outcome.text);
        success = outcome.success;
        stopped = outcome.stopped;
    }

    let text = notes
        .iter()
        .map(|note| format!("note: {note}\n"))
        .collect::<String>()
        + &body;
    let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    let summary = if stopped {
        CANCELLED_SUMMARY.to_string()
    } else {
        summarize_text(&text)
    };
    Ok(BuildReport {
        success,
        diagnostics: cmake_diagnostics(&text, source_root),
        duration_ms,
        // A successful build says which tree it used and what it had to decide; a failing one keeps
        // the compiler's own last line, which is the part the user acts on.
        summary: if success && !stopped && !notes.is_empty() {
            truncate(&format!("{summary} · {}", notes.join(" · ")), SUMMARY_LIMIT)
        } else {
            summary
        },
        // The program the build just wrote, resolved against the tree this build configured.
        artifact: if success {
            cmake_artifact(&text, &plan.build_root, started_at)
        } else {
            None
        },
    })
}
