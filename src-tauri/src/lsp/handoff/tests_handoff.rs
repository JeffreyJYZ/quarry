#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

#[cfg(test)]
pub mod tests {
    use super::support::handoff_for;
    use super::*;
    use std::env;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    struct Fixture {
        path: PathBuf,
    }

    impl Fixture {
        fn new(label: &str) -> Self {
            let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = env::temp_dir().join(format!(
                "quarry-handoff-{label}-{}-{unique}",
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

        fn info(&self, kind: ProjectKind) -> ProjectInfo {
            let root = self.root().display().to_string();
            ProjectInfo {
                root: root.clone(),
                opened_root: root.clone(),
                name: "demo".to_string(),
                kind,
                build_root: root,
                launch_config: None,
            }
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_string()).collect()
    }

    #[test]
    fn rust_analyzer_keeps_the_users_arguments_untouched() {
        let fixture = Fixture::new("rust");
        fixture.write("build/compile_commands.json", "[]");
        let user = args(&["--log-file=/tmp/ra.log"]);
        let Handoff {
            args: computed,
            database,
            ..
        } = handoff_for("rust-analyzer", &fixture.info(ProjectKind::Cargo), &user);
        assert_eq!(computed, user);
        assert_eq!(database, None);
    }

    /// A directory with nothing to compile has nothing to analyse, so it is handed no directory —
    /// the plain C/C++ case that *does* gain one lives in `tests_plain.rs`.
    #[test]
    fn a_directory_with_no_source_gains_no_flag() {
        let fixture = Fixture::new("plain");
        let Handoff {
            args: computed,
            database,
            ..
        } = handoff_for(
            "clangd",
            &fixture.info(ProjectKind::Unknown),
            &args(&["--log=error"]),
        );
        assert_eq!(computed, args(&["--log=error"]));
        assert_eq!(database, None);
    }

    #[test]
    fn a_cmake_project_is_pointed_at_its_build_directory() {
        let fixture = Fixture::new("cmake");
        fixture.write("CMakeLists.txt", "project(demo)\n");
        fixture.write("build/compile_commands.json", "[]");
        let Handoff {
            args: computed,
            database,
            ..
        } = handoff_for("clangd", &fixture.info(ProjectKind::Cmake), &[]);
        let expected = format!(
            "{COMPILE_COMMANDS_DIR}={}",
            fixture.root().join("build").display()
        );
        assert_eq!(database, Some(fixture.root().join("build")));
        assert_eq!(computed.first(), Some(&expected), "{computed:?}");
    }

    #[test]
    fn a_user_named_directory_is_never_replaced() {
        let fixture = Fixture::new("user-dir");
        fixture.write("CMakeLists.txt", "project(demo)\n");
        fixture.write("build/compile_commands.json", "[]");
        let user = args(&["--compile-commands-dir=/custom/db"]);
        let Handoff {
            args: computed,
            database,
            ..
        } = handoff_for("clangd", &fixture.info(ProjectKind::Cmake), &user);
        assert_eq!(computed, user, "no second flag may shadow the user's");
        assert_eq!(
            database, None,
            "and nothing may be configured behind their back"
        );
    }

    #[test]
    fn a_user_query_driver_still_composes_with_our_directory() {
        let fixture = Fixture::new("query-driver");
        fixture.write("build/compile_commands.json", "[]");
        let user = args(&["--query-driver=/opt/toolchain/bin/g++"]);
        let computed = clangd_args(&user, Some(&fixture.root().join("build")));
        assert_eq!(computed[0], "--query-driver=/opt/toolchain/bin/g++");
        assert_eq!(computed.len(), 2);
        assert!(computed[1].starts_with(COMPILE_COMMANDS_DIR));
    }

    #[test]
    fn the_driver_the_database_names_is_queried() {
        let fixture = Fixture::new("drivers");
        let compiler = fixture.root().join("toolchain/g++");
        fixture.write("toolchain/g++", "");
        fixture.write(
            "build/compile_commands.json",
            &format!(
                r#"[{{"directory": "{root}", "file": "{root}/a.cpp", "arguments": ["{compiler}", "-c", "a.cpp"]}}]"#,
                root = fixture.root().display(),
                compiler = compiler.display()
            ),
        );
        let computed = clangd_args(&[], Some(&fixture.root().join("build")));
        let driver = computed
            .iter()
            .find(|arg| arg.starts_with(QUERY_DRIVER))
            .expect("a query-driver flag");
        assert_eq!(driver, &format!("{QUERY_DRIVER}={}", compiler.display()));
    }

    #[test]
    fn a_flag_is_recognised_in_both_spellings() {
        assert!(carries_flag(&args(&["--query-driver=a"]), QUERY_DRIVER));
        assert!(carries_flag(&args(&["--query-driver", "a"]), QUERY_DRIVER));
        assert!(!carries_flag(
            &args(&["--query-driver-extra=a"]),
            QUERY_DRIVER
        ));
        assert!(!carries_flag(&args(&["--log=error"]), QUERY_DRIVER));
    }
}
