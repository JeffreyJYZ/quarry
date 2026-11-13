#![allow(unused_imports)]

//! What a plain-clang build adds on top of its own flags when a compile database describes the tree.

pub(crate) use crate::project;
pub(crate) use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
pub use serde_json::Value;
pub use std::collections::HashSet;
pub use std::path::Path;
pub use std::process::Command;
pub use std::time::Instant;

use super::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn database_flags_reach_the_compiler_command() {
        let output = plain_clang_build_dir(Path::new("/work"))
            .join("demo")
            .display()
            .to_string();
        let argv = plain_clang_argv_with(
            "/work",
            "demo",
            &["main.cpp"],
            &["-I/work/include".to_string(), "-DFEATURE=1".to_string()],
        );
        assert_eq!(
            argv,
            vec![
                "clang++",
                "-std=c++20",
                "-g",
                "-O0",
                "-fno-color-diagnostics",
                "-I/work/include",
                "-DFEATURE=1",
                "-o",
                output.as_str(),
                "main.cpp",
            ]
        );
    }

    #[test]
    fn the_databases_standard_replaces_the_default_one() {
        let argv =
            plain_clang_argv_with("/work", "demo", &["main.cpp"], &["-std=c++23".to_string()]);
        let standards: Vec<&String> = argv.iter().filter(|arg| arg.starts_with("-std=")).collect();
        assert_eq!(standards, vec!["-std=c++23"]);
    }

    #[test]
    fn a_project_without_a_database_keeps_the_default_standard() {
        let argv = plain_clang_argv_with("/work", "demo", &["main.cpp"], &[]);
        let standards: Vec<&String> = argv.iter().filter(|arg| arg.starts_with("-std=")).collect();
        assert_eq!(standards, vec!["-std=c++20"]);
    }

    /// A database-only project before the hand-off: the include path the build needs is everywhere
    /// except in the compiler command, so code the project's own build accepts fails here.
    #[test]
    fn a_compile_database_project_builds_with_its_include_path() {
        if crate::resolve::resolve("clang++").is_none() {
            return;
        }
        let root = std::env::temp_dir().join(format!(
            "quarry-database-build-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|elapsed| elapsed.as_nanos())
                .unwrap_or(0)
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("src")).expect("create source directory");
        std::fs::create_dir_all(root.join("vendor/demo")).expect("create vendor directory");
        std::fs::write(
            root.join("vendor/demo/greeting.hpp"),
            "#pragma once\ninline int greeting() { return 7; }\n",
        )
        .expect("write header");
        std::fs::write(
            root.join("src/main.cpp"),
            "#include <demo/greeting.hpp>\nint main() { return greeting(); }\n",
        )
        .expect("write source");

        let path = root.display().to_string();
        let without =
            run_plain_clang_build(&BuildState::default(), &path, "app").expect("build run");
        assert!(
            !without.success,
            "a vendor header outside every convention is only reachable through the database"
        );

        std::fs::write(
            root.join(crate::project::DATABASE_FILE),
            format!(
                r#"[{{"directory": "{path}", "arguments": ["clang++", "-Ivendor", "-c", "src/main.cpp"]}}]"#
            ),
        )
        .expect("write database");

        let with = run_plain_clang_build(&BuildState::default(), &path, "app").expect("build run");
        assert!(
            with.success,
            "the database says where the header is, so the build must use it: {}",
            with.summary
        );
        let _ = std::fs::remove_dir_all(&root);
    }
}
