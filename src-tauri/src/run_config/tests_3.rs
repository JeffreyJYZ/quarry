#![allow(unused_imports)]

pub(crate) use crate::types::{LaunchConfig, LaunchFile};
pub use std::fs;
pub use std::io::ErrorKind;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_3 {
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
    pub fn an_unknown_preset_lists_the_available_names() {
        let fixture = Fixture::new("unknown");
        fixture.write(
            ".quarry/launch.json",
            &json("{ \"name\": \"first\", \"program\": \"a\" }, { \"name\": \"second\" }"),
        );

        let error = resolve(&fixture.root(), "third").expect_err("unknown preset must fail");

        assert!(error.contains("third"), "unexpected error: {error}");
        assert!(error.contains("first"), "unexpected error: {error}");
        assert!(error.contains("second"), "unexpected error: {error}");
    }

    #[test]
    pub fn a_preset_without_a_program_cannot_be_launched() {
        let fixture = Fixture::new("no-program");
        fixture.write(
            ".quarry/launch.json",
            &json("{ \"name\": \"build-only\", \"build\": \"cargo build\" }"),
        );

        let error = resolve(&fixture.root(), "build-only").expect_err("program is required");

        assert!(error.contains("build-only"), "unexpected error: {error}");
        assert!(error.contains("program"), "unexpected error: {error}");
    }
}
