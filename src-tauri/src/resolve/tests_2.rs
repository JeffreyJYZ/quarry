#![allow(unused_imports)]

pub use std::collections::HashSet;
pub use std::env;
pub use std::ffi::OsString;
pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::process::Command;

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_2 {
    use super::*;

    use std::sync::{Mutex, MutexGuard, OnceLock};

    /// `PATH` is process-wide, so every test that touches it holds this lock.
    pub fn path_lock() -> MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        let guard = LOCK.get_or_init(|| Mutex::new(())).lock();
        guard.unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Set `PATH` for the duration of a test, restoring the previous value afterwards.
    pub fn with_path<T>(value: &str, body: impl FnOnce() -> T) -> T {
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
    pub struct TempDir(PathBuf);

    impl TempDir {
        pub(crate) fn new(tag: &str) -> Self {
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

        pub(crate) fn path(&self) -> &Path {
            &self.0
        }

        /// Write a file, optionally executable.
        pub(crate) fn file(&self, name: &str, executable: bool) -> PathBuf {
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
    pub fn child_path_puts_the_binary_first_then_the_toolchain_dirs_then_the_inherited_entries() {
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
    pub fn the_gui_fallback_list_covers_rustup_and_homebrew() {
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
    pub fn a_tool_only_in_a_fallback_directory_is_still_found() {
        // The rustup shim directory is where a Dock-launched app has to look for rust-analyzer.
        let shim = std::path::PathBuf::from("/opt/homebrew/opt/rustup/bin/rust-analyzer");
        if !shim.exists() {
            return;
        }
        let found = super::on_path_in(&super::fallback_directories(), "rust-analyzer");
        assert_eq!(found, Some(shim));
    }
}
