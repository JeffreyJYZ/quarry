#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
pub use serde_json::Value;
pub use std::collections::HashSet;
pub use std::path::Path;
pub use std::process::Command;
pub use std::time::Instant;

use super::*;

/// Builds a C/C++ project with clang directly, for projects without a build system.
///
/// A project with one language runs one command, exactly as before. A mixed C/C++ project runs one
/// compile per language and then a link: `-std=c++20` on a C file would compile it as C++, which is
/// wrong for anything that only C accepts, so the driver and the standard are chosen per source.
///
/// Every command runs through `run_child` like every other build, so a cancelled compile is
/// signalled and a quit during one cannot leave `clang` behind; the first failing command ends the
/// sequence, and its output is what the build panel reports.
///
/// The flags are the project's own knowledge, from [`build_flags`]: a real database's when it has
/// one, otherwise the ones its layout and settings state. The same answer is written as a
/// `compile_commands.json` in the build directory, so the clangd session started for this project
/// analyses the code with the flags this compiler used.
pub fn run_plain_clang_build(
    state: &BuildState,
    root: &str,
    name: &str,
) -> Result<BuildReport, String> {
    let root_path = Path::new(root);
    let sources = collect_plain_clang_sources(root_path)?;
    if sources.is_empty() {
        return Err(no_build_system());
    }

    let flags = build_flags(root_path, &sources);
    let commands = plain_build_commands(root, name, &sources, &flags);

    let build_dir = plain_clang_build_dir(root_path);
    std::fs::create_dir_all(&build_dir)
        .map_err(|error| format!("cannot create {}: {error}", build_dir.display()))?;
    if commands.len() > 1 {
        let objects = build_dir.join(OBJECT_DIR);
        std::fs::create_dir_all(&objects)
            .map_err(|error| format!("cannot create {}: {error}", objects.display()))?;
    }

    // Written before the compile so a failing build still leaves analysis a description to use.
    let mut notes: Vec<String> = Vec::new();
    match synthesize_plain_database(root_path, &sources) {
        Ok(Some(written)) => {
            if let Some(note) = written.note() {
                notes.push(note);
            }
        }
        // A project that describes itself needs nothing said about it.
        Ok(None) => {}
        // A failed write must not fail the build: it is still a working compile without a database.
        Err(why) => notes.push(format!("no compiler database for the plain build: {why}")),
    }

    let started = Instant::now();
    let mut body = String::new();
    let mut success = true;
    let mut stopped = false;
    for command in &commands {
        let resolved = crate::resolve::resolve(&command.program).ok_or_else(|| {
            format!(
                "{} is not on PATH: C/C++ support needs it installed",
                command.program
            )
        })?;
        let mut child = Command::new(&resolved.path);
        child.args(&command.argv[1..]).current_dir(root);
        let captured = run_child(state, &mut child, &command.program, root)?;
        body.push_str(&String::from_utf8_lossy(&captured.stdout));
        body.push('\n');
        body.push_str(&String::from_utf8_lossy(&captured.stderr));
        success = captured.success && !captured.stopped;
        stopped = captured.stopped;
        if !success {
            break;
        }
    }
    let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);

    // Notes precede the output they describe, as in `run_cmake_build`: the status bar reports the
    // last line, which must stay the compiler's own verdict.
    let text = notes
        .iter()
        .map(|note| format!("note: {note}\n"))
        .collect::<String>()
        + &body;

    let mut diagnostics = parse_text_diagnostics(&text, root_path);
    for diagnostic in &mut diagnostics {
        diagnostic.source = Some(PLAIN_CLANG_SOURCE.to_string());
    }

    let summary = if stopped {
        CANCELLED_SUMMARY.to_string()
    } else {
        summarize_text_with(&body, DEFAULT_CLANG_SUMMARY)
    };

    Ok(BuildReport {
        success,
        diagnostics,
        duration_ms,
        summary: if success && !notes.is_empty() {
            truncate(&format!("{summary} · {}", notes.join(" · ")), SUMMARY_LIMIT)
        } else {
            summary
        },
        // A failed compile leaves whatever the previous build wrote at this path, so naming it
        // would report a program this build never produced; `run_cmake_build` gates the same way.
        artifact: if success {
            Some(external(&build_dir.join(name)))
        } else {
            None
        },
    })
}
