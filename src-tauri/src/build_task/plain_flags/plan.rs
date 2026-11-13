//! What a plain C/C++ build would run, as data.
//!
//! `project_plan` asks this so a probe can run the product's own build instead of re-deriving it:
//! the argv comes from the same [`build_flags`] and [`plain_clang_argv_with`] the build calls, and
//! the note is what the synthesis wrote, if it wrote anything. Like the CMake section, reading it is
//! not free of side effects: the database is synthesised the way opening the project does.

#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub use serde::Serialize;

use super::*;

/// One plain C/C++ build: the program, the argv, the directory it runs in, and any note.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlainPlan {
    /// The compiler the product would spawn, or null when it cannot find one.
    pub program: Option<String>,
    pub cwd: String,
    /// Full argv, program first, exactly as `run_plain_clang_build` spawns it.
    pub argv: Vec<String>,
    pub note: Option<String>,
}

/// Ask the product what it would run for `root`, named `name` the way its project model names it.
pub fn plain_build_plan(root: &str, name: &str) -> Result<PlainPlan, String> {
    let path = Path::new(root);
    let sources = collect_plain_clang_sources(path)?;
    if sources.is_empty() {
        return Err(no_build_system());
    }
    let flags = build_flags(path, &sources);
    let argv = plain_clang_argv_with(root, name, &sources, &flags.flags);
    let note = synthesize_plain_database(path, &sources)
        .ok()
        .flatten()
        .and_then(|written| written.note());
    Ok(PlainPlan {
        program: crate::resolve::resolve(flags.plain.compiler())
            .map(|found| found.path.display().to_string()),
        cwd: root.to_string(),
        argv,
        note,
    })
}
