#![allow(unused_imports)]

pub use std::collections::HashSet;
pub use std::env;
pub use std::ffi::OsString;
pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::process::Command;

use super::*;

/// Where a tool was found.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    /// Found on `PATH`.
    Path,
    /// Found through `xcrun --find`.
    Xcrun,
}

/// A tool that was found, and where.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resolved {
    /// The tool's name, as asked for.
    pub name: String,
    /// The absolute path of the executable.
    pub path: PathBuf,
    /// Which probe found it.
    pub source: Source,
}

/// Directories a GUI launch never inherits, checked after `PATH` and before `xcrun`.
///
/// A Finder-launched app gets launchd's `PATH`, which on this machine is empty: the rustup shims
/// (`rust-analyzer`, `cargo`) and the Homebrew bin are invisible, so a Rust project opened from the
/// Dock would silently have no language server and therefore no diagnostics.
pub fn fallback_directories() -> Vec<PathBuf> {
    let mut directories = vec![
        PathBuf::from("/opt/homebrew/opt/rustup/bin"),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ];
    if let Some(home) = env::var_os("HOME") {
        let home = PathBuf::from(home);
        directories.push(home.join(".cargo").join("bin"));
        directories.push(home.join(".local").join("bin"));
    }
    directories
}

/// Find `name` on `PATH`, then in the toolchain directories a GUI launch cannot see, then `xcrun`.
pub fn resolve(name: &str) -> Option<Resolved> {
    if let Some(path) = on_path(name) {
        return Some(Resolved {
            name: name.to_string(),
            path,
            source: Source::Path,
        });
    }

    if let Some(path) = on_path_in(&fallback_directories(), name) {
        return Some(Resolved {
            name: name.to_string(),
            path,
            source: Source::Path,
        });
    }

    if let Some(path) = via_xcrun(name) {
        return Some(Resolved {
            name: name.to_string(),
            path,
            source: Source::Xcrun,
        });
    }

    None
}

/// A `Command` for a tool, found the same way, with a `PATH` a child can actually use.
///
/// `Command::new("cargo")` fails with `os error 2` in a Dock launch, because the process inherits
/// launchd's empty `PATH`; resolving the binary and handing the child the toolchain directories fixes
/// both halves of that: the spawn finds the program, and the program finds its own tools.
pub fn command(program: &str) -> Result<std::process::Command, String> {
    let resolved = resolve(program).ok_or_else(|| {
        format!("{program} was not found on PATH, in the toolchain directories, or through xcrun")
    })?;
    let mut command = std::process::Command::new(&resolved.path);
    command.env("PATH", child_path(&resolved.path));
    Ok(command)
}

/// Walk `PATH` by hand rather than shelling out, so a directory is never interpreted or expanded.
/// The first entry that holds an executable file wins.
pub fn on_path(name: &str) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    on_path_in(&env::split_paths(&path).collect::<Vec<_>>(), name)
}

/// Walk an explicit list of directories, in order.
pub fn on_path_in(directories: &[PathBuf], name: &str) -> Option<PathBuf> {
    directories.iter().find_map(|directory| {
        if directory.as_os_str().is_empty() {
            return None;
        }

        let candidate = directory.join(name);
        is_executable(&candidate).then_some(candidate)
    })
}

/// Ask `xcrun` for the tool's path. A failure only means "not found".
pub fn via_xcrun(name: &str) -> Option<PathBuf> {
    let output = Command::new("xcrun").args(["--find", name]).output().ok()?;
    if !output.status.success() {
        return None;
    }

    let found = parse_xcrun_stdout(&output.stdout)?;
    if !found.exists() {
        return None;
    }

    Some(found)
}
