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
///
/// The same holds on Windows, where a Dock- or Start-menu-launched app gets the system `PATH` and not
/// the one a developer's shell builds: LLVM installed beside the product (`%ProgramFiles%\LLVM`) and
/// the LLVM Visual Studio ships inside itself (`…\VC\Tools\Llvm\<arch>\bin`, where `lldb-dap.exe`
/// lives) are both absent from it. Listing the macOS paths on Windows was worse than useless: it made
/// the search look complete while never finding the adapter the image actually installed.
pub fn fallback_directories() -> Vec<PathBuf> {
    let mut directories = Vec::new();

    #[cfg(target_os = "macos")]
    {
        directories.push(PathBuf::from("/opt/homebrew/opt/rustup/bin"));
        directories.push(PathBuf::from("/opt/homebrew/bin"));
        directories.push(PathBuf::from("/usr/local/bin"));
    }

    #[cfg(windows)]
    {
        directories.extend(windows_llvm::directories());
    }

    let home = env::var_os("HOME").map(PathBuf::from);
    if let Some(home) = home {
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
    let names = tool_candidates(name);
    directories.iter().find_map(|directory| {
        if directory.as_os_str().is_empty() {
            return None;
        }

        names.iter().find_map(|name| {
            let candidate = directory.join(name);
            is_executable(&candidate).then_some(candidate)
        })
    })
}

/// The file names one tool name can resolve to on this platform.
///
/// Windows binaries carry `.exe`, and this resolver stats the literal candidate: `Command::new`
/// finds `cargo` there because Windows appends the suffix itself, but `on_path("cargo")` never
/// matched `cargo.exe`, so the test dock reported cargo missing and Cargo discovery could not run.
pub fn tool_candidates(name: &str) -> Vec<OsString> {
    tool_candidates_on(name, cfg!(windows))
}

/// The same list for an explicit platform, so the Windows answer is a test on any machine.
pub fn tool_candidates_on(name: &str, windows: bool) -> Vec<OsString> {
    let mut names = vec![OsString::from(name)];
    if windows && !name.to_ascii_lowercase().ends_with(".exe") {
        names.push(OsString::from(format!("{name}.exe")));
    }
    names
}

/// Ask `xcrun` for the tool's path. A failure only means "not found".
///
/// `xcrun` is Apple's; on another platform the spawn can only fail, so it is not attempted.
pub fn via_xcrun(name: &str) -> Option<PathBuf> {
    if !cfg!(target_os = "macos") {
        return None;
    }
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
