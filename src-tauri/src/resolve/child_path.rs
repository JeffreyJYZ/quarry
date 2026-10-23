#![allow(unused_imports)]

pub use std::collections::HashSet;
pub use std::env;
pub use std::ffi::OsString;
pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::process::Command;

use super::*;

/// The first line of `xcrun --find` output, trimmed; empty output is "not found".
pub fn parse_xcrun_stdout(stdout: &[u8]) -> Option<PathBuf> {
    let stdout = String::from_utf8_lossy(stdout);
    let found = stdout.lines().next()?.trim();
    if found.is_empty() {
        return None;
    }

    Some(PathBuf::from(found))
}
/// The `PATH` a spawned child needs.
///
/// A GUI-launched app inherits launchd's `PATH`, which lacks the rustup shims; a rustup-installed
/// `rust-analyzer` then dies at startup because it cannot find `cargo`. Put the binary's own
/// directory and the usual toolchain directories in front of the inherited value.
pub fn child_path(binary: &Path) -> OsString {
    let mut directories: Vec<PathBuf> = Vec::new();

    if let Some(parent) = binary.parent() {
        directories.push(parent.to_path_buf());
    }

    for extra in [
        "/opt/homebrew/opt/rustup/bin",
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
    ] {
        directories.push(PathBuf::from(extra));
    }

    if let Some(inherited) = env::var_os("PATH") {
        directories.extend(env::split_paths(&inherited));
    }

    let mut seen: HashSet<PathBuf> = HashSet::new();
    let unique: Vec<PathBuf> = directories
        .into_iter()
        .filter(|directory| !directory.as_os_str().is_empty() && seen.insert(directory.clone()))
        .collect();

    env::join_paths(unique).unwrap_or_default()
}

#[cfg(unix)]
pub fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    // `metadata` follows symlinks, so a shim that links to the real binary counts as a hit.
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
