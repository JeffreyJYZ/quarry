#![allow(unused_imports)]

//! A plain C/C++ project compiled by quarry with the flags its own layout states.

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
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::*;

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn scratch(label: &str) -> PathBuf {
        let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "quarry-plain-build-{label}-{}-{unique}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create scratch directory");
        root
    }

    fn write(root: &Path, name: &str, text: &str) {
        let target = root.join(name);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).expect("create parent");
        }
        fs::write(target, text).expect("write file");
    }

    /// A header reachable only from the project root, a define it needs, and a C++20 header: the
    /// three things the build used to know and the analysis did not.
    fn plain_project(root: &Path) {
        write(
            root,
            "lib/greet.h",
            "#pragma once\n#ifndef PARITY_PLAIN\n#error \"PARITY_PLAIN comes from the project\"\n#endif\nint plain_greeting();\n",
        );
        write(
            root,
            "lib/greet.cpp",
            "#include \"greet.h\"\nint plain_greeting() { return PARITY_PLAIN; }\n",
        );
        write(
            root,
            "src/main.cpp",
            "#include \"lib/greet.h\"\n#include <format>\n\nint main() {\n\treturn static_cast<int>(std::format(\"{}\", plain_greeting()).size());\n}\n",
        );
        write(
            root,
            ".quarry/settings.json",
            r#"{ "cppFlags": "-DPARITY_PLAIN=1" }"#,
        );
    }

    #[test]
    fn a_plain_project_builds_with_its_own_flags_and_leaves_a_database() {
        if crate::resolve::resolve("clang++").is_none() {
            return;
        }
        let root = scratch("flags");
        plain_project(&root);
        let path = root.display().to_string();

        let report =
            run_plain_clang_build(&BuildState::default(), &path, "app").expect("the build runs");

        assert!(
            report.success,
            "the build's own flags compile it: {}",
            report.summary
        );
        assert_eq!(
            report.summary.matches("wrote ").count(),
            1,
            "one note, once: {}",
            report.summary
        );
        let database = root
            .join(crate::build_task::QUARRY_BUILD_DIR)
            .join(crate::project::DATABASE_FILE);
        assert!(database.is_file(), "the analysis gets the build's flags");

        // The plan the probe reads spawns this same argv, and the second read writes no note.
        let plan = plain_build_plan(&path, "app").expect("the product plans a plain build");
        assert_eq!(
            plan.commands.len(),
            1,
            "one language compiles and links in one command"
        );
        let argv = &plan.commands[0].argv;
        for expected in [
            format!("-I{}", root.display()),
            "-DPARITY_PLAIN=1".to_string(),
            "-std=c++20".to_string(),
            root.join(crate::build_task::QUARRY_BUILD_DIR)
                .join("app")
                .display()
                .to_string(),
        ] {
            assert!(argv.contains(&expected), "{expected} in {argv:?}");
        }
        assert!(plan.note.is_none(), "unchanged flags write nothing new");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_project_with_a_real_database_writes_none_and_reports_no_note() {
        if crate::resolve::resolve("clang++").is_none() {
            return;
        }
        let root = scratch("database");
        write(
            &root,
            "include/greet.hpp",
            "inline int greeting() { return 1; }\n",
        );
        write(
            &root,
            "src/main.cpp",
            "#include <greet.hpp>\nint main() { return greeting(); }\n",
        );
        write(
            &root,
            crate::project::DATABASE_FILE,
            r#"[{"directory": ".", "arguments": ["clang++", "-Iinclude", "-c", "src/main.cpp"]}]"#,
        );
        let path = root.display().to_string();

        let report =
            run_plain_clang_build(&BuildState::default(), &path, "app").expect("the build runs");

        assert!(report.success, "{}", report.summary);
        assert!(
            !report.summary.contains("wrote "),
            "a project that describes itself has nothing to synthesise: {}",
            report.summary
        );
        assert!(
            !root
                .join(crate::build_task::QUARRY_BUILD_DIR)
                .join(crate::project::DATABASE_FILE)
                .exists()
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_project_stating_its_own_flags_keeps_them_and_gets_no_database() {
        if crate::resolve::resolve("clang++").is_none() {
            return;
        }
        let root = scratch("instruction");
        write(&root, "main.cpp", "int main() { return 0; }\n");
        write(&root, "compile_flags.txt", "--std=c++23\n");
        let path = root.display().to_string();

        let report =
            run_plain_clang_build(&BuildState::default(), &path, "app").expect("the build runs");

        assert!(report.success, "{}", report.summary);
        assert!(
            !root
                .join(crate::build_task::QUARRY_BUILD_DIR)
                .join(crate::project::DATABASE_FILE)
                .exists(),
            "clangd reads compile_flags.txt itself, so a database of ours would replace it"
        );
        let _ = fs::remove_dir_all(&root);
    }
}
