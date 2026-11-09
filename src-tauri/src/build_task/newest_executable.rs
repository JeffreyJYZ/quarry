#![allow(unused_imports)]

pub(crate) use crate::types::BuildReport;
pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::time::{Duration, SystemTime};

use super::*;

/// How deep the search goes under the build directory.
pub const MAX_DEPTH: usize = 4;

/// Directories a build writes that never hold the program itself.
pub const SKIPPED: [&str; 6] = [
    "CMakeFiles",
    "CMakeScripts",
    ".git",
    "node_modules",
    ".cmake",
    "CMakeTmp",
];

/// Suffixes that are never the program a user runs.
pub const NOT_PROGRAMS: [&str; 5] = [".dylib", ".so", ".a", ".o", ".d"];

/// Every file under `root` that could be the program, with the time the build wrote it.
///
/// Nothing is filtered by time here: a build start means something only next to a build, so the
/// timestamp travels with the candidate and `choose_artifact` is where it is compared.
pub fn executable_candidates(root: &Path) -> Vec<Candidate> {
    let mut candidates = Vec::new();
    walk(root, 0, &mut candidates);
    candidates
}

fn walk(root: &Path, depth: usize, candidates: &mut Vec<Candidate>) {
    if depth > MAX_DEPTH {
        return;
    }
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if meta.is_dir() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if SKIPPED.contains(&name.as_str()) {
                continue;
            }
            walk(&path, depth + 1, candidates);
            continue;
        }
        if !is_candidate(&path) {
            continue;
        }
        let Ok(modified) = meta.modified() else {
            continue;
        };
        candidates.push(Candidate::new(path, modified));
    }
}

/// An executable whose name does not say it is something else.
///
/// The name checks matter as much as the mode bits: a `.o` file is not executable and a build
/// script is, and either one winning would hand Run the wrong file.
pub fn is_candidate(path: &Path) -> bool {
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy())
        .unwrap_or_default();
    if name.starts_with('.') || NOT_PROGRAMS.iter().any(|suffix| name.ends_with(suffix)) {
        return false;
    }
    is_executable(path)
}

#[cfg(unix)]
pub fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    fs::metadata(path)
        .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
pub fn is_executable(path: &Path) -> bool {
    fs::metadata(path)
        .map(|meta| meta.is_file())
        .unwrap_or(false)
}
