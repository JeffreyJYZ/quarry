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
/// The compile runs through `run_child` like every other build, so a cancelled compile is signalled
/// and a quit during one cannot leave `clang` behind.
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

    let compiler = if sources
        .iter()
        .all(|path| path.extension().map(|e| e == "c").unwrap_or(false))
    {
        "clang"
    } else {
        "clang++"
    };

    let resolved = crate::resolve::resolve(compiler).ok_or_else(|| {
        format!("{compiler} is not on PATH: C/C++ support needs {compiler} installed")
    })?;

    let build_dir = plain_clang_build_dir(root_path);
    std::fs::create_dir_all(&build_dir)
        .map_err(|error| format!("cannot create {}: {error}", build_dir.display()))?;

    let argv = plain_clang_argv(root, name, &sources);

    let started = Instant::now();
    let mut command = Command::new(&resolved.path);
    command.args(&argv[1..]).current_dir(root);
    let captured = run_child(state, &mut command, compiler, root)?;
    let duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);

    let mut text = String::from_utf8_lossy(&captured.stdout).into_owned();
    text.push('\n');
    text.push_str(&String::from_utf8_lossy(&captured.stderr));

    let mut diagnostics = parse_text_diagnostics(&text, root_path);
    for diagnostic in &mut diagnostics {
        diagnostic.source = Some(PLAIN_CLANG_SOURCE.to_string());
    }

    let success = captured.success && !captured.stopped;

    Ok(BuildReport {
        success,
        diagnostics,
        duration_ms,
        summary: if captured.stopped {
            CANCELLED_SUMMARY.to_string()
        } else {
            summarize_text_with(&text, DEFAULT_CLANG_SUMMARY)
        },
        // A failed compile leaves whatever the previous build wrote at this path, so naming it
        // would report a program this build never produced; `run_cmake_build` gates the same way.
        artifact: if success {
            Some(build_dir.join(name).display().to_string())
        } else {
            None
        },
    })
}
