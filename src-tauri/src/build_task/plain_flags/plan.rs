//! What a plain C/C++ build would run, as data.
//!
//! `project_plan` asks this so a probe can run the product's own build instead of re-deriving it:
//! the commands come from the same [`build_flags`] and [`plain_build_commands`] the build calls, and
//! the note is what the synthesis wrote, if it wrote anything. A mixed C/C++ project reports more
//! than one command, because its C and C++ sources are not compiled by the same driver. Like the
//! CMake section, reading it is not free of side effects: the database is synthesised the way
//! opening the project does.

#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub use serde::Serialize;

use super::*;

/// One command a plain C/C++ build runs, with the program the product resolved for it.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlainStep {
    /// The compiler this step spawns, or null when it cannot be found.
    pub program: Option<String>,
    /// Full argv, program first, exactly as `run_plain_clang_build` spawns it.
    pub argv: Vec<String>,
    pub cwd: String,
}

/// One plain C/C++ build: every command in order, and any note.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlainPlan {
    /// The compile commands and the link, in the order the build runs them.
    pub commands: Vec<PlainStep>,
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
    let commands = plain_build_commands(root, name, &sources, &flags);
    // A mixed project's commands write objects beside the binary, because the build itself creates
    // that directory before it compiles; the plan reports commands that run as reported, so it does
    // the same preparation the build does.
    if commands.len() > 1 {
        let objects = plain_clang_build_dir(path).join(OBJECT_DIR);
        let _ = std::fs::create_dir_all(objects);
    }
    let steps = commands
        .into_iter()
        .map(|command| PlainStep {
            program: crate::resolve::resolve(&command.program)
                .map(|found| found.path.display().to_string()),
            argv: command.argv,
            cwd: root.to_string(),
        })
        .collect();
    let note = synthesize_plain_database(path, &sources)
        .ok()
        .flatten()
        .and_then(|written| written.note());
    Ok(PlainPlan {
        commands: steps,
        note,
    })
}
