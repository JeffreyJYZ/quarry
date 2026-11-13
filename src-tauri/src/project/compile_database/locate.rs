#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// The file CMake exports when `-DCMAKE_EXPORT_COMPILE_COMMANDS=ON` is set.
pub const DATABASE_FILE: &str = "compile_commands.json";

/// Out-of-source directories checked before any scan: quarry's own CMake build directory first, then
/// the two CLion creates by convention.
pub const BUILD_DIRS: [&str; 3] = ["build", "cmake-build-debug", "cmake-build-release"];

/// How many directory levels below the source root are searched for a database.
pub const SCAN_DEPTH: usize = 2;

/// The directory holding the database that describes this project's tree.
///
/// `build_root` wins because it is where detection said the project builds; the source root comes
/// next, which is where an in-source configure leaves the file and what quarry's own CMake build
/// writes today. The conventional out-of-source directories follow, and a bounded scan catches a
/// preset, multi-config or hand-named build tree.
pub fn locate_database(root: &Path, build_root: &Path) -> Option<PathBuf> {
    if build_root.join(DATABASE_FILE).is_file() {
        return Some(build_root.to_path_buf());
    }
    if root.join(DATABASE_FILE).is_file() {
        return Some(root.to_path_buf());
    }
    for name in BUILD_DIRS {
        let candidate = root.join(name);
        if candidate.join(DATABASE_FILE).is_file() {
            return Some(candidate);
        }
    }
    scan(root, 0)
}

/// First directory, at most [`SCAN_DEPTH`] levels below `dir`, that holds a database.
///
/// Shallower wins, then alphabetical order, so two runs over one tree always pick the same file.
fn scan(dir: &Path, depth: usize) -> Option<PathBuf> {
    if depth >= SCAN_DEPTH {
        return None;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return None;
    };
    let mut children: Vec<PathBuf> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if crate::ignore::is_dir(&name) {
            continue;
        }
        children.push(path);
    }
    children.sort();

    for child in &children {
        if child.join(DATABASE_FILE).is_file() {
            return Some(child.clone());
        }
    }
    for child in &children {
        if let Some(found) = scan(child, depth + 1) {
            return Some(found);
        }
    }
    None
}
