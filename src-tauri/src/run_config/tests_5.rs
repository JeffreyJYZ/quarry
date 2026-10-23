#![allow(unused_imports)]

pub(crate) use crate::types::{LaunchConfig, LaunchFile};
pub use std::fs;
pub use std::io::ErrorKind;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_5 {
    use super::*;

    use crate::types::LaunchPreset;

    use std::env;

    use std::sync::atomic::{AtomicU64, Ordering};

    pub static COUNTER: AtomicU64 = AtomicU64::new(0);

    /// Throwaway project root under the system temp dir, removed on drop.
    pub struct Fixture {
        pub(crate) path: PathBuf,
    }

    impl Fixture {
        pub(crate) fn new(label: &str) -> Self {
            let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = env::temp_dir().join(format!(
                "quarry-launch-{label}-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create fixture directory");
            Self { path }
        }

        pub(crate) fn write(&self, name: &str, contents: &str) {
            let target = self.path.join(name);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).expect("create fixture parent");
            }
            fs::write(target, contents).expect("write fixture file");
        }

        pub(crate) fn read(&self, name: &str) -> String {
            fs::read_to_string(self.path.join(name)).expect("read fixture file")
        }

        /// Canonical path, which is what the module reports on macOS (temp dir is a symlink).
        pub(crate) fn root(&self) -> String {
            self.path
                .canonicalize()
                .expect("canonicalize fixture")
                .to_string_lossy()
                .into_owned()
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    pub fn preset(name: &str) -> LaunchPreset {
        LaunchPreset {
            name: name.to_string(),
            program: Some("target/debug/app".to_string()),
            args: Vec::new(),
            cwd: None,
            build: None,
            stop_on_entry: false,
            init_commands: Vec::new(),
        }
    }

    pub fn json(presets: &str) -> String {
        format!("{{ \"configurations\": [{presets}] }}\n")
    }

    #[test]
    pub fn a_duplicate_preset_name_is_rejected() {
        let fixture = Fixture::new("duplicate");
        let root = fixture.root();
        let file = LaunchFile {
            configurations: vec![preset("run"), preset("run")],
        };

        let error = write(&root, &file).expect_err("duplicate names must fail");

        assert!(error.contains("\"run\""), "unexpected error: {error}");
        assert!(
            !fixture
                .path
                .join(LAUNCH_DIR)
                .join(LAUNCH_FILE_NAME)
                .exists(),
            "a rejected file must not be written"
        );
    }

    #[test]
    pub fn an_empty_preset_name_is_rejected() {
        let fixture = Fixture::new("empty-name");
        let root = fixture.root();
        let file = LaunchFile {
            configurations: vec![preset("  ")],
        };

        let error = write(&root, &file).expect_err("empty names must fail");

        assert!(error.contains("empty name"), "unexpected error: {error}");
        assert!(
            !fixture
                .path
                .join(LAUNCH_DIR)
                .join(LAUNCH_FILE_NAME)
                .exists(),
            "a rejected file must not be written"
        );
    }

    #[test]
    pub fn a_root_that_is_not_a_directory_is_rejected() {
        let fixture = Fixture::new("bad-root");
        let missing = fixture.path.join("does-not-exist");

        let error = write(&missing.to_string_lossy(), &LaunchFile::default())
            .expect_err("a missing root must fail");

        assert!(
            error.contains("does-not-exist"),
            "unexpected error: {error}"
        );
        assert!(!missing.exists(), "the root must not be created");
    }
}
