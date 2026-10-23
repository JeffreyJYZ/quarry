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
pub mod tests_group_1 {
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
    pub fn on_path_finds_an_executable_and_rejects_a_plain_file() {
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
    pub fn earlier_path_entries_win() {
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
}
