//! One resolver for every external tool the IDE spawns.
//!
//! Contract: probe `PATH` first, then `xcrun --find`. A GUI-launched app inherits launchd's `PATH`,
//! which lacks the rustup shims and the Apple toolchain, so `xcrun` is the only way to reach
//! `clangd`, `clang-format` and `lldb-dap`. A missing `xcrun`, a non-zero status or a path that
//! does not exist all mean "not found", never an error.
//!
//! Toolchains are detected, never bundled: this module never downloads or installs anything.

use std::collections::HashSet;
use std::env;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

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
fn fallback_directories() -> Vec<PathBuf> {
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

/// Walk `PATH` by hand rather than shelling out, so a directory is never interpreted or expanded.
/// The first entry that holds an executable file wins.
pub fn on_path(name: &str) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    on_path_in(&env::split_paths(&path).collect::<Vec<_>>(), name)
}

/// Walk an explicit list of directories, in order.
fn on_path_in(directories: &[PathBuf], name: &str) -> Option<PathBuf> {
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

/// The first line of `xcrun --find` output, trimmed; empty output is "not found".
fn parse_xcrun_stdout(stdout: &[u8]) -> Option<PathBuf> {
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
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    // `metadata` follows symlinks, so a shim that links to the real binary counts as a hit.
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, MutexGuard, OnceLock};

    /// `PATH` is process-wide, so every test that touches it holds this lock.
    fn path_lock() -> MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        let guard = LOCK.get_or_init(|| Mutex::new(())).lock();
        guard.unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Set `PATH` for the duration of a test, restoring the previous value afterwards.
    fn with_path<T>(value: &str, body: impl FnOnce() -> T) -> T {
        let _guard = path_lock();
        let previous = env::var_os("PATH");
        unsafe { env::set_var("PATH", value) };
        let result = body();
        match previous {
            Some(previous) => unsafe { env::set_var("PATH", previous) },
            None => unsafe { env::remove_var("PATH") },
        }
        result
    }

    /// A temporary directory that cleans itself up.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new(tag: &str) -> Self {
            let mut path = env::temp_dir();
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|elapsed| elapsed.as_nanos())
                .unwrap_or(0);
            path.push(format!(
                "quarry-resolve-{tag}-{}-{stamp}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("temporary directory");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }

        /// Write a file, optionally executable.
        fn file(&self, name: &str, executable: bool) -> PathBuf {
            let path = self.0.join(name);
            fs::write(&path, "#!/bin/sh\n").expect("write file");
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mode = if executable { 0o755 } else { 0o644 };
                fs::set_permissions(&path, fs::Permissions::from_mode(mode)).expect("chmod");
            }
            path
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn on_path_finds_an_executable_and_rejects_a_plain_file() {
        let directory = TempDir::new("exec");
        let executable = directory.file("quarry-tool-exec", true);
        let plain = directory.file("quarry-tool-plain", false);
        let path = directory.path().to_string_lossy().into_owned();

        with_path(&path, || {
            assert_eq!(
                on_path("quarry-tool-exec"),
                Some(executable.clone()),
                "an executable file on PATH is found"
            );
            assert_eq!(
                on_path("quarry-tool-plain"),
                None,
                "a file without an exec bit is not a hit"
            );
        });

        assert!(plain.exists());
    }

    #[test]
    fn earlier_path_entries_win() {
        let first = TempDir::new("first");
        let second = TempDir::new("second");
        let first_tool = first.file("quarry-tool-dup", true);
        let second_tool = second.file("quarry-tool-dup", true);
        let path = format!(
            "{}:{}",
            first.path().to_string_lossy(),
            second.path().to_string_lossy()
        );

        with_path(&path, || {
            assert_eq!(on_path("quarry-tool-dup"), Some(first_tool));
        });

        assert!(second_tool.exists());
    }

    #[test]
    fn child_path_puts_the_binary_first_then_the_toolchain_dirs_then_the_inherited_entries() {
        let directory = TempDir::new("child");
        let binary = directory.file("quarry-child-binary", true);
        let path = format!("{}:/opt/custom/bin", directory.path().to_string_lossy());

        with_path(&path, || {
            let child = child_path(&binary);
            let entries: Vec<PathBuf> = env::split_paths(&child).collect();

            assert_eq!(
                entries.first(),
                Some(&directory.path().to_path_buf()),
                "the binary's own directory comes first"
            );

            let expected = [
                "/opt/homebrew/opt/rustup/bin",
                "/opt/homebrew/bin",
                "/usr/local/bin",
                "/usr/bin",
                "/bin",
            ];
            for (offset, directory) in expected.iter().enumerate() {
                assert_eq!(
                    entries.get(1 + offset),
                    Some(&PathBuf::from(directory)),
                    "toolchain directory {directory} keeps its place"
                );
            }

            assert!(
                entries
                    .iter()
                    .any(|entry| entry == &PathBuf::from("/opt/custom/bin")),
                "the inherited entries follow"
            );

            let mut seen = HashSet::new();
            for entry in &entries {
                assert!(seen.insert(entry.clone()), "duplicate entry: {entry:?}");
            }
        });
    }

    #[test]
    fn the_gui_fallback_list_covers_rustup_and_homebrew() {
        let directories = super::fallback_directories();
        assert!(
            directories.contains(&std::path::PathBuf::from("/opt/homebrew/opt/rustup/bin")),
            "rustup shims are missing from the fallback probe"
        );
        assert!(
            directories.iter().any(|dir| dir.ends_with(".cargo/bin")),
            "~/.cargo/bin is missing from the fallback probe"
        );
    }

    #[test]
    fn a_tool_only_in_a_fallback_directory_is_still_found() {
        // The rustup shim directory is where a Dock-launched app has to look for rust-analyzer.
        let shim = std::path::PathBuf::from("/opt/homebrew/opt/rustup/bin/rust-analyzer");
        if !shim.exists() {
            return;
        }
        let found = super::on_path_in(&super::fallback_directories(), "rust-analyzer");
        assert_eq!(found, Some(shim));
    }

    #[test]
    fn resolve_prefers_a_path_hit_over_xcrun() {
        let directory = TempDir::new("prefer");
        let tool = directory.file("quarry-tool-prefer", true);
        let path = directory.path().to_string_lossy().into_owned();

        with_path(&path, || {
            let resolved = resolve("quarry-tool-prefer").expect("the tool is on PATH");
            assert_eq!(resolved.source, Source::Path);
            assert_eq!(resolved.path, tool);
            assert_eq!(resolved.name, "quarry-tool-prefer");
        });
    }

    #[test]
    fn xcrun_output_parses_to_the_first_line() {
        assert_eq!(
            parse_xcrun_stdout(b"/usr/bin/clangd\n"),
            Some(PathBuf::from("/usr/bin/clangd"))
        );
        assert_eq!(
            parse_xcrun_stdout(b"  /usr/bin/clangd  \nignored\n"),
            Some(PathBuf::from("/usr/bin/clangd"))
        );
        assert_eq!(parse_xcrun_stdout(b"\n"), None);
        assert_eq!(parse_xcrun_stdout(b""), None);
    }

    #[test]
    fn a_missing_xcrun_is_not_an_error() {
        // An empty PATH means `xcrun` itself cannot be spawned, so nothing runs.
        with_path("", || {
            assert!(via_xcrun("quarry-tool-that-does-not-exist").is_none());
            assert!(resolve("quarry-tool-that-does-not-exist").is_none());
        });
    }
}
