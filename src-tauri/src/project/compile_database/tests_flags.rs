#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::env;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    /// One throwaway directory, for the two tests that need a real database file on disk.
    struct Fixture {
        path: PathBuf,
    }

    impl Fixture {
        fn new(label: &str) -> Self {
            let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = env::temp_dir().join(format!(
                "quarry-database-flags-{label}-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create fixture directory");
            Self { path }
        }

        fn write(&self, name: &str, contents: &str) {
            let target = self.path.join(name);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).expect("create fixture parent");
            }
            fs::write(target, contents).expect("write fixture file");
        }

        fn root(&self) -> PathBuf {
            self.path.canonicalize().expect("canonicalize fixture")
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn driver_paths_are_absolute_and_only_real_compilers_are_named() {
        let fixture = Fixture::new("drivers");
        fixture.write("bin/my-clang++", "");
        let driver = fixture.root().join("bin/my-clang++");
        fixture.write(
            "compile_commands.json",
            &format!(
                r#"[{{"directory": "{root}", "arguments": ["{driver}", "-c", "a.cpp"]}},
                   {{"directory": "{root}", "arguments": ["ccache", "clang++", "-c", "b.cpp"]}}]"#,
                root = fixture.root().display(),
                driver = driver.display()
            ),
        );
        assert_eq!(
            compiler_drivers(&fixture.root().join(DATABASE_FILE)),
            vec![driver.display().to_string()],
            "a launcher in front of the compiler is not the driver clangd can query"
        );
    }

    #[test]
    fn flags_keep_includes_defines_and_the_standard() {
        let entries = vec![CompileEntry {
            directory: PathBuf::from("/work"),
            argv: vec![
                "clang++".to_string(),
                "-Iinclude".to_string(),
                "-isystem".to_string(),
                "/opt/sdk/include".to_string(),
                "-DFEATURE=1".to_string(),
                "-std=c++20".to_string(),
                "-fno-color-diagnostics".to_string(),
                "-o".to_string(),
                "a.o".to_string(),
                "-c".to_string(),
                "/work/a.cpp".to_string(),
            ],
        }];
        assert_eq!(
            flags_from_entries(&entries, true),
            vec![
                "-I/work/include".to_string(),
                "-isystem/opt/sdk/include".to_string(),
                "-DFEATURE=1".to_string(),
                "-std=c++20".to_string(),
            ]
        );
    }

    #[test]
    fn a_define_with_two_values_is_dropped() {
        let entries = vec![
            CompileEntry {
                directory: PathBuf::from("/work"),
                argv: vec![
                    "clang++".into(),
                    "-DMODE=1".into(),
                    "-c".into(),
                    "a.cpp".into(),
                ],
            },
            CompileEntry {
                directory: PathBuf::from("/work"),
                argv: vec![
                    "clang++".into(),
                    "-DMODE=2".into(),
                    "-c".into(),
                    "b.cpp".into(),
                ],
            },
        ];
        let flags = flags_from_entries(&entries, true);
        assert!(
            !flags.iter().any(|flag| flag.starts_with("-DMODE")),
            "one invocation cannot compile both values: {flags:?}"
        );
    }

    #[test]
    fn a_c_standard_is_not_handed_to_a_cxx_build() {
        let entries = vec![CompileEntry {
            directory: PathBuf::from("/work"),
            argv: vec!["cc".into(), "-std=c17".into(), "-c".into(), "a.c".into()],
        }];
        assert!(flags_from_entries(&entries, true).is_empty());
        assert_eq!(flags_from_entries(&entries, false), vec!["-std=c17"]);
    }

    #[test]
    fn the_framework_search_path_is_kept() {
        let entries = vec![CompileEntry {
            directory: PathBuf::from("/work"),
            argv: vec![
                "clang++".into(),
                "-F".into(),
                "Frameworks".into(),
                "-c".into(),
                "a.mm".into(),
            ],
        }];
        assert_eq!(
            flags_from_entries(&entries, true),
            vec!["-F/work/Frameworks"]
        );
    }

    #[test]
    fn a_sysroot_is_a_directory_and_a_target_is_not() {
        let entries = vec![CompileEntry {
            directory: PathBuf::from("/work"),
            argv: vec![
                "clang++".into(),
                "--sysroot=../../sdk".into(),
                "-target".into(),
                "arm64-apple-macos".into(),
                "-c".into(),
                "a.cpp".into(),
            ],
        }];
        assert_eq!(
            flags_from_entries(&entries, true),
            vec!["--sysroot=/work/../../sdk", "-targetarm64-apple-macos"]
        );
    }
}
