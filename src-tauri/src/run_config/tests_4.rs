#![allow(unused_imports)]

pub(crate) use crate::types::{LaunchConfig, LaunchFile};
pub use std::fs;
pub use std::io::ErrorKind;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_4 {
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
    pub fn write_then_read_round_trips_with_two_space_indentation() {
        let fixture = Fixture::new("roundtrip");
        let root = fixture.root();
        let file = LaunchFile {
            configurations: vec![LaunchPreset {
                name: "run".to_string(),
                program: Some("target/debug/app".to_string()),
                args: vec!["--verbose".to_string()],
                cwd: Some("crates/app".to_string()),
                build: Some("cargo build".to_string()),
                stop_on_entry: true,
                init_commands: vec!["command script import /tmp/lldb_lookup.py".to_string()],
            }],
        };

        let written = write(&root, &file).expect("write succeeds");

        let expected = Path::new(&root)
            .join(LAUNCH_DIR)
            .join(LAUNCH_FILE_NAME)
            .to_string_lossy()
            .into_owned();
        assert_eq!(written, expected);

        let text = fixture.read(".quarry/launch.json");
        assert!(text.ends_with('\n'), "no trailing newline: {text:?}");
        assert!(!text.ends_with("\n\n"), "more than one trailing newline");
        assert!(
            text.contains("\n  \"configurations\": [\n"),
            "top level is not two-space indented: {text}"
        );
        assert!(
            text.contains("\n    {\n"),
            "preset fields are not four-space indented: {text}"
        );

        let back = read(&root).expect("read back");
        assert_eq!(back.configurations.len(), 1);
        let preset = &back.configurations[0];
        assert_eq!(preset.name, "run");
        assert_eq!(preset.program.as_deref(), Some("target/debug/app"));
        assert_eq!(preset.args, vec!["--verbose".to_string()]);
        assert_eq!(preset.cwd.as_deref(), Some("crates/app"));
        assert_eq!(preset.build.as_deref(), Some("cargo build"));
        assert!(preset.stop_on_entry);
        assert_eq!(
            preset.init_commands,
            vec!["command script import /tmp/lldb_lookup.py".to_string()]
        );
    }
}
