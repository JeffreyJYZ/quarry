#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

/// The directory whose `compile_commands.json` this clangd session should read.
///
/// A user-supplied `--compile-commands-dir` is their decision, so it is never second-guessed: no
/// discovery, no configure, and no path written into their tree. Otherwise the project's own
/// database is used wherever it lives, and a CMake project that has none is configured once into
/// `build/` — the directory quarry's own launch model already expects — so analysis starts with the
/// flags its build will use rather than with no include path at all.
pub fn database_for(info: &ProjectInfo, user: &[String]) -> Option<PathBuf> {
    if carries_flag(user, COMPILE_COMMANDS_DIR) {
        return None;
    }
    let root = Path::new(&info.root);
    let build_root = Path::new(&info.build_root);

    if let Some(found) = crate::project::locate_database(root, build_root) {
        // A failed configure leaves the old database in place, which is still better than none.
        if info.kind == ProjectKind::Cmake {
            let _ = refresh(root, &found);
        }
        return Some(found);
    }

    if info.kind != ProjectKind::Cmake {
        return None;
    }
    let build = root.join(crate::launch::CMAKE_BUILD_DIR);
    if configure(root, &build).is_err() {
        return None;
    }
    build
        .join(crate::project::DATABASE_FILE)
        .is_file()
        .then_some(build)
}
