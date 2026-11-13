#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use crate::build_task::{CmakeOptions, cmake_plan};
pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

/// The directory whose `compile_commands.json` this clangd session should read.
///
/// A user-supplied `--compile-commands-dir` is their decision, so it is never second-guessed: no
/// discovery, no configure, and no path written into their tree. A CMake project is answered by its
/// own configure model — the directory its presets, its toolchain and its configured trees name — so
/// a preset building into `out/debug` is analysed against `out/debug` rather than a guessed `build/`.
/// Plain clang and a project detected by its own database keep the search they always had.
pub fn database_for(info: &ProjectInfo, user: &[String]) -> Option<PathBuf> {
    if carries_flag(user, COMPILE_COMMANDS_DIR) {
        return None;
    }
    let root = Path::new(&info.root);
    if info.kind != ProjectKind::Cmake {
        return crate::project::locate_database(root, Path::new(&info.build_root));
    }
    cmake_database(root)
}

/// Where a CMake project's database belongs: the tree the plan names, and one configure through it.
///
/// The model already decides the build tree, the argv a build runs and whether the tree is current,
/// so the hand-off asks it instead of scanning for `build/` or a two-level-deep directory. The same
/// configure the build runs also synthesises the database from the CMake file API where the
/// generator writes none, so that tree holds one either way; there is no second tree configured only
/// to have a database to read.
fn cmake_database(root: &Path) -> Option<PathBuf> {
    let options = CmakeOptions::for_root(root);
    let Ok(plan) = cmake_plan(root, false, &options) else {
        // A model the project's own files cannot produce must not keep the session from starting.
        return crate::project::locate_database(root, root);
    };
    // A failed configure leaves the old database in place, which is still better than none.
    ensure_database(root, &plan).then_some(plan.build_root)
}
