#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::env;
    use std::process::Command;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{Duration, SystemTime};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    const CMAKE_LISTS: &str = "cmake_minimum_required(VERSION 3.20)\n\
         project(teacher_demo CXX)\n\
         add_executable(demo src/main.cpp)\n";

    struct Fixture {
        path: PathBuf,
    }

    impl Fixture {
        fn new(label: &str) -> Self {
            let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = env::temp_dir().join(format!(
                "quarry-handoff-real-{label}-{}-{unique}",
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

        fn info(&self) -> ProjectInfo {
            let root = self.root().display().to_string();
            ProjectInfo {
                root: root.clone(),
                opened_root: root.clone(),
                name: "teacher_demo".to_string(),
                kind: ProjectKind::Cmake,
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

    fn cmake_available() -> bool {
        crate::resolve::resolve(crate::build_task::CMAKE_PROGRAM).is_some()
            && (crate::resolve::resolve("clang++").is_some()
                || crate::resolve::resolve("g++").is_some()
                || crate::resolve::resolve("c++").is_some())
    }

    fn project() -> Fixture {
        let fixture = Fixture::new("project");
        fixture.write("CMakeLists.txt", CMAKE_LISTS);
        fixture.write("src/main.cpp", "int main() { return 0; }\n");
        fixture
    }

    #[test]
    fn a_cmake_project_without_a_database_is_configured_into_build() {
        if !cmake_available() {
            return;
        }
        let fixture = project();
        let (args, database) = server_args("clangd", &fixture.info(), &[]);

        let build = fixture.root().join("build");
        assert_eq!(database, Some(build.clone()));
        assert!(
            build.join(crate::project::DATABASE_FILE).is_file(),
            "the session start must leave a database to analyse against"
        );
        assert_eq!(
            args.first().map(String::as_str),
            Some(format!("{COMPILE_COMMANDS_DIR}={}", build.display()).as_str())
        );
        assert!(
            args.iter().any(|arg| arg.starts_with(QUERY_DRIVER)),
            "the configured compiler must be queryable: {args:?}"
        );
    }

    #[test]
    fn a_database_in_clions_directory_is_named_and_reconfigured_when_stale() {
        if !cmake_available() {
            return;
        }
        let fixture = project();
        let root = fixture.root();
        let build = root.join("cmake-build-debug");
        let configured = Command::new(
            crate::resolve::resolve(crate::build_task::CMAKE_PROGRAM)
                .expect("cmake")
                .path,
        )
        .args([
            "-S",
            &root.display().to_string(),
            "-B",
            &build.display().to_string(),
            "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
        ])
        .output()
        .expect("run cmake");
        assert!(configured.status.success(), "{:?}", configured);

        let database = build.join(crate::project::DATABASE_FILE);
        let before = fs::metadata(&database)
            .and_then(|meta| meta.modified())
            .expect("database timestamp");

        // An edit after the configure is exactly the stale case: the database describes the old tree.
        std::thread::sleep(Duration::from_millis(20));
        fixture.write(
            "CMakeLists.txt",
            &format!("{CMAKE_LISTS}add_compile_definitions(DEMO_VERSION=2)\n"),
        );
        assert!(
            crate::build_task::configure_need(
                &root,
                &build,
                &crate::build_task::ConfigureIntent::default()
            )
            .is_some()
        );

        let (args, named) = server_args("clangd", &fixture.info(), &[]);
        assert_eq!(
            named,
            Some(build.clone()),
            "the CLion tree stays the answer"
        );
        assert!(
            args.iter()
                .any(|arg| arg == &format!("{COMPILE_COMMANDS_DIR}={}", build.display())),
            "{args:?}"
        );
        let after = fs::metadata(&database)
            .and_then(|meta| meta.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        assert!(after > before, "the stale database must be regenerated");
        assert!(
            !root.join("build").exists(),
            "a found database is never moved into a second directory"
        );
    }
}
