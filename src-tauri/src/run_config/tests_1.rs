#![allow(unused_imports)]

pub(crate) use crate::types::{LaunchConfig, LaunchFile};
pub use std::fs;
pub use std::io::ErrorKind;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_1 {
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
    pub fn a_missing_file_is_an_empty_launch_file() {
        let fixture = Fixture::new("missing");
        let root = fixture.root();

        let file = read(&root).expect("a project without presets is normal");

        assert!(file.configurations.is_empty());
        assert!(
            !fixture
                .path
                .join(LAUNCH_DIR)
                .join(LAUNCH_FILE_NAME)
                .exists(),
            "a read must not create the file"
        );
    }

    #[test]
    pub fn a_file_without_configurations_parses_as_empty() {
        let fixture = Fixture::new("bare");
        fixture.write(".quarry/launch.json", "{}\n");

        let file = read(&fixture.root()).expect("missing key defaults to empty");

        assert!(file.configurations.is_empty());
    }

    #[test]
    pub fn a_malformed_file_names_the_path_and_position() {
        let fixture = Fixture::new("malformed");
        fixture.write(".quarry/launch.json", "{\n  \"configurations\": [\n");
        let root = fixture.root();

        let error = read(&root).expect_err("truncated JSON must fail");

        let expected = Path::new(&root)
            .join(LAUNCH_DIR)
            .join(LAUNCH_FILE_NAME)
            .to_string_lossy()
            .into_owned();
        assert!(error.contains(&expected), "unexpected error: {error}");
        assert!(error.contains("line"), "error lacks a line: {error}");
        assert!(error.contains("column"), "error lacks a column: {error}");
    }
}
