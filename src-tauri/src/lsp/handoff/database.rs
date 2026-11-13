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

/// Where a CMake project's database belongs, and the one configure that puts it there.
///
/// The model already decides the build tree and the argv a build runs, so the hand-off asks it
/// instead of scanning for `build/` or a two-level-deep directory: a preset `binaryDir` outside the
/// conventional names is the project's answer, and a tree without a database is configured through
/// its preset, its toolchain and the export flag rather than a bare `-S … -B build` that a
/// preset-only project rejects.
fn cmake_database(root: &Path) -> Option<PathBuf> {
    let options = CmakeOptions::for_root(root);
    let Ok(plan) = cmake_plan(root, false, &options) else {
        // A model the project's own files cannot produce must not keep the session from starting.
        return crate::project::locate_database(root, root);
    };
    if plan
        .build_root
        .join(crate::project::DATABASE_FILE)
        .is_file()
    {
        // A failed configure leaves the old database in place, which is still better than none.
        let _ = refresh(root, &plan.build_root);
        return Some(plan.build_root);
    }
    if configure(root, &plan.build_root).is_err() {
        return None;
    }
    if plan
        .build_root
        .join(crate::project::DATABASE_FILE)
        .is_file()
    {
        return Some(plan.build_root);
    }
    // A generator that never writes a compiler database (Xcode, Visual Studio) leaves clangd with
    // no flags at all. The one recipe this hand-off always ran is kept as the last resort, into the
    // directory it has always used, so analysis still has a database to read.
    let fallback = root.join(crate::build_task::BUILD_DIR);
    configure(root, &fallback).ok()?;
    fallback
        .join(crate::project::DATABASE_FILE)
        .is_file()
        .then_some(fallback)
}
