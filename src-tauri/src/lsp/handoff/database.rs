#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub use crate::build_task::{BuildProfile, CmakeOptions, cmake_plan};
pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

/// What discovery found: the directory clangd should read, and why a start had to configure.
pub struct Database {
    pub dir: Option<PathBuf>,
    /// One line a session start reports when the tree had to be reconfigured for the profile.
    pub note: Option<String>,
}

impl Database {
    fn at(dir: Option<PathBuf>) -> Self {
        Self { dir, note: None }
    }
}

/// The directory whose `compile_commands.json` this clangd session should read.
///
/// A user-supplied `--compile-commands-dir` is their decision, so it is never second-guessed: no
/// discovery, no configure, and no path written into their tree. A CMake project is answered by its
/// own configure model — the directory its presets, its toolchain and its configured trees name — so
/// a preset building into `out/debug` is analysed against `out/debug` rather than a guessed `build/`.
/// Any other C/C++ project keeps the database it already has; one that has none gets the plain
/// build's own flags written where that build writes, so the analysis it is about to run matches the
/// compile it would run.
///
/// `profile` is the one the build was asked for, so the tree that is configured and the database
/// that is read carry the flags the user compiled with rather than a Debug default.
pub fn database_for(info: &ProjectInfo, user: &[String], profile: BuildProfile) -> Database {
    if carries_flag(user, COMPILE_COMMANDS_DIR) {
        return Database::at(None);
    }
    let root = Path::new(&info.root);
    if info.kind == ProjectKind::Cmake {
        return cmake_database(root, profile);
    }
    // A project's own database always wins: it is what its own build reads.
    if let Some(found) = crate::project::locate_database(root, Path::new(&info.build_root)) {
        return Database::at(Some(found));
    }
    Database::at(plain_database(root))
}

/// The directory holding the database synthesised for a C/C++ project with no build system.
///
/// The flags are the plain build's own, so this is the same directory that build writes into — the
/// mirror of the CMake lane, where the tree that builds is the tree clangd reads. A project that
/// states its own flags (`compile_flags.txt`, `.clangd`), names no source, or cannot be written to
/// answers `None`, and the session starts exactly as it did before.
fn plain_database(root: &Path) -> Option<PathBuf> {
    let sources = crate::build_task::collect_plain_clang_sources(root).ok()?;
    let written = crate::build_task::synthesize_plain_database(root, &sources).ok()??;
    written.path.parent().map(Path::to_path_buf)
}

/// Where a CMake project's database belongs: the tree the plan names, and one configure through it.
///
/// The model already decides the build tree, the argv a build runs and whether the tree is current,
/// so the hand-off asks it instead of scanning for `build/` or a two-level-deep directory. The same
/// configure the build runs also synthesises the database from the CMake file API where the
/// generator writes none, so that tree holds one either way; there is no second tree configured only
/// to have a database to read.
fn cmake_database(root: &Path, profile: BuildProfile) -> Database {
    let options = CmakeOptions::for_root(root);
    let Ok(plan) = cmake_plan(root, profile, &options) else {
        // A model the project's own files cannot produce must not keep the session from starting.
        return Database::at(crate::project::locate_database(root, root));
    };
    // A failed configure leaves the old database in place, which is still better than none.
    let ensured = ensure_database(root, &plan);
    Database {
        dir: ensured.current.then_some(plan.build_root),
        note: ensured.note,
    }
}
