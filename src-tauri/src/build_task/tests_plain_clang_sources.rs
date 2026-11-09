#![allow(unused_imports)]

//! The plain-clang source walk: what a project without a build system hands the compiler.
//!
//! Kept apart from the rest of the build tests because the subject is one function and its edges are all
//! directory shapes.

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
    use std::fs;

    fn fixture(label: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "quarry-plain-clang-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("create fixture");
        path
    }

    fn touch(dir: &Path, relative: &str) {
        let path = dir.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent");
        }
        fs::write(path, "int main() { return 0; }\n").expect("write source");
    }

    fn names(root: &Path) -> Vec<String> {
        collect_plain_clang_sources(root)
            .expect("collect")
            .into_iter()
            .map(|path| path.display().to_string())
            .collect()
    }

    #[test]
    fn a_source_in_the_root_is_collected() {
        let root = fixture("root");
        touch(&root, "main.cpp");
        assert_eq!(names(&root), vec!["main.cpp"]);
    }

    #[test]
    fn a_source_two_levels_down_is_collected() {
        let root = fixture("nested");
        touch(&root, "src/impl/engine.cpp");
        touch(&root, "src/main.cpp");
        assert_eq!(names(&root), vec!["src/impl/engine.cpp", "src/main.cpp"]);
    }

    #[test]
    fn ignored_directories_are_not_walked() {
        let root = fixture("ignored");
        touch(&root, "src/main.cpp");
        touch(&root, "build/generated.cpp");
        touch(&root, ".git/hooks/hook.cpp");
        assert_eq!(names(&root), vec!["src/main.cpp"]);
    }

    #[test]
    fn the_walk_stops_at_the_depth_limit() {
        let root = fixture("depth");
        // One directory deeper than the walk is allowed to enter.
        let deep = format!(
            "{}/too-deep.cpp",
            (0..=PLAIN_CLANG_MAX_DEPTH)
                .map(|_| "a")
                .collect::<Vec<_>>()
                .join("/")
        );
        touch(&root, &deep);
        assert!(
            names(&root).is_empty(),
            "a file past the limit is not collected"
        );
    }

    #[test]
    fn a_failed_build_reports_no_artifact() {
        if crate::resolve::resolve("clang").is_none() {
            return;
        }
        let root = fixture("failed");
        fs::write(root.join("main.c"), "int main(void) { this is not c }\n").expect("write source");

        let report =
            run_plain_clang_build(&root.display().to_string(), "failed-app").expect("build run");
        assert!(!report.success, "a syntax error must fail the build");
        assert_eq!(report.artifact, None, "nothing was produced to launch");
    }

    #[test]
    fn headers_are_not_sources() {
        let root = fixture("headers");
        touch(&root, "src/main.cpp");
        fs::write(root.join("src/main.hpp"), "#pragma once\n").expect("write header");
        assert_eq!(names(&root), vec!["src/main.cpp"]);
    }
}
