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
pub mod tests_group_3 {
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
    pub fn resolve_prefers_a_path_hit_over_xcrun() {
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
    pub fn xcrun_output_parses_to_the_first_line() {
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
    pub fn a_missing_xcrun_is_not_an_error() {
        // An empty PATH means `xcrun` itself cannot be spawned, so nothing runs.
        with_path("", || {
            assert!(via_xcrun("quarry-tool-that-does-not-exist").is_none());
            assert!(resolve("quarry-tool-that-does-not-exist").is_none());
        });
    }
}
