#![allow(unused_imports)]

pub(crate) use crate::types::{LaunchConfig, LaunchFile};
pub use std::fs;
pub use std::io::ErrorKind;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_2 {
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
    pub fn a_relative_program_without_cwd_resolves_under_the_root() {
        let fixture = Fixture::new("relative");
        fixture.write(
            ".quarry/launch.json",
            &json(concat!(
                "{ \"name\": \"run\", ",
                "\"program\": \"target/debug/app\", ",
                "\"args\": [\"--flag\", \"value\"], ",
                "\"stopOnEntry\": true, ",
                "\"initCommands\": [\"command script import /tmp/lldb_lookup.py\"] }",
            )),
        );
        let root = fixture.root();

        let config = resolve(&root, "run").expect("preset resolves");

        let expected_program = Path::new(&root)
            .join("target")
            .join("debug")
            .join("app")
            .to_string_lossy()
            .into_owned();
        assert!(
            Path::new(&config.program).is_absolute(),
            "{}",
            config.program
        );
        assert_eq!(config.program, expected_program);
        assert_eq!(config.cwd, root);
        assert_eq!(config.args, vec!["--flag".to_string(), "value".to_string()]);
        assert!(config.stop_on_entry);
        assert_eq!(
            config.init_commands,
            vec!["command script import /tmp/lldb_lookup.py".to_string()]
        );
    }

    #[test]
    pub fn an_absolute_program_and_relative_cwd_keep_their_meaning() {
        let fixture = Fixture::new("absolute");
        fixture.write(
            ".quarry/launch.json",
            &json("{ \"name\": \"run\", \"program\": \"/usr/bin/true\", \"cwd\": \"crates/app\" }"),
        );
        let root = fixture.root();

        let config = resolve(&root, "run").expect("preset resolves");

        assert_eq!(config.program, "/usr/bin/true");
        assert_eq!(
            config.cwd,
            Path::new(&root)
                .join("crates")
                .join("app")
                .to_string_lossy()
                .into_owned()
        );
    }
}
