#![allow(unused_imports)]

pub(crate) use crate::types::BuildReport;
pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::time::{Duration, SystemTime};

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

/// The executable a build just wrote, newest first.
///
/// A CMake project does not name its output in a way we can predict: the binary is the project's
/// `add_executable` name, not the directory name, and it can land in a subdirectory. Reporting the
/// file the build actually touched is the only honest answer, and it is what Run and Debug launch.
///
/// `since` filters out whatever was already there, so an unchanged stale binary is never reported as
/// this build's output. Ties are broken by path so the result is stable.
pub fn newest_executable(root: &Path, since: SystemTime) -> Option<String> {
    let mut best: Option<(SystemTime, PathBuf)> = None;
    walk(root, 0, since, &mut best);
    best.map(|(_, path)| path.to_string_lossy().into_owned())
}

fn walk(root: &Path, depth: usize, since: SystemTime, best: &mut Option<(SystemTime, PathBuf)>) {
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
            walk(&path, depth + 1, since, best);
            continue;
        }
        if !is_candidate(&path, &meta, since) {
            continue;
        }
        let modified = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        let better = match best {
            None => true,
            Some((known, known_path)) => {
                modified > *known || (modified == *known && path < *known_path)
            }
        };
        if better {
            *best = Some((modified, path));
        }
    }
}

/// An executable, written by this build, whose name does not say it is something else.
fn is_candidate(path: &Path, meta: &fs::Metadata, since: SystemTime) -> bool {
    if meta.modified().map(|time| time < since).unwrap_or(true) {
        return false;
    }
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
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    fs::metadata(path)
        .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    fs::metadata(path)
        .map(|meta| meta.is_file())
        .unwrap_or(false)
}
