#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::ProjectInfo;
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_1 {
    use super::*;

    pub fn scratch(label: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("quarry-new-project-{}-{label}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("creates the scratch directory");
        dir
    }

    pub fn create(parent: &Path, name: &str, kind: &str) -> Result<ProjectInfo, String> {
        create_with(parent, name, kind, "")
    }

    pub fn create_with(
        parent: &Path,
        name: &str,
        kind: &str,
        standard: &str,
    ) -> Result<ProjectInfo, String> {
        create_project(
            parent.display().to_string(),
            name.to_string(),
            kind.to_string(),
            standard.to_string(),
        )
    }

    #[test]
    pub fn every_kind_writes_its_files_and_is_detected() {
        let cases = [
            ("rust-bin", "src/main.rs", crate::types::ProjectKind::Cargo),
            ("rust-lib", "src/lib.rs", crate::types::ProjectKind::Cargo),
            ("c-cmake", "src/main.c", crate::types::ProjectKind::Cmake),
            (
                "cpp-cmake",
                "src/main.cpp",
                crate::types::ProjectKind::Cmake,
            ),
        ];
        for (kind, entry, expected) in cases {
            let parent = scratch(kind);
            let info = create(&parent, "demo", kind).expect("creates the project");
            assert_eq!(info.name, "demo", "{kind} name");
            assert!(
                Path::new(&info.root).join(entry).is_file(),
                "{kind} did not write {entry}"
            );
            assert_eq!(info.kind, expected, "{kind} detected as the wrong kind");
            if kind.ends_with("cmake") {
                let manifest = fs::read_to_string(Path::new(&info.root).join("CMakeLists.txt"))
                    .expect("reads");
                let language = if kind == "c-cmake" { "C" } else { "CXX" };
                assert!(
                    manifest.contains(&format!("project(demo {language})")),
                    "{kind} manifest: {manifest}"
                );
            }
            let _ = fs::remove_dir_all(&parent);
        }
    }

    #[test]
    pub fn the_c_scaffold_is_plain_c() {
        let parent = scratch("c-contents");
        let info = create(&parent, "capp", "c-cmake").expect("creates the project");
        let source = fs::read_to_string(Path::new(&info.root).join("src/main.c")).expect("reads");
        assert!(source.contains("#include <stdio.h>"), "{source}");
        assert!(source.contains("int main(void)"), "{source}");
        assert!(
            !source.contains("iostream"),
            "C scaffold leaked C++: {source}"
        );
        let _ = fs::remove_dir_all(&parent);
    }

    #[test]
    pub fn a_library_scaffold_carries_a_passing_test() {
        let parent = scratch("lib-contents");
        let info = create(&parent, "demo", "rust-lib").expect("creates the project");
        let source = fs::read_to_string(Path::new(&info.root).join("src/lib.rs")).expect("reads");
        assert!(source.contains("#[test]"), "{source}");
        let _ = fs::remove_dir_all(&parent);
    }

    #[test]
    pub fn bad_names_and_targets_are_refused() {
        let parent = scratch("refusals");
        assert!(
            create(&parent, "  ", "rust-bin")
                .unwrap_err()
                .contains("empty")
        );
        assert!(
            create(&parent, "a/b", "rust-bin")
                .unwrap_err()
                .contains("single path segment")
        );
        assert!(
            create(&parent, "..", "rust-bin")
                .unwrap_err()
                .contains("single path segment")
        );

        fs::create_dir_all(parent.join("taken")).expect("creates the taken directory");
        assert!(
            create(&parent, "taken", "rust-bin")
                .unwrap_err()
                .contains("already exists")
        );

        assert!(
            create(&parent, "demo", "kotlin")
                .unwrap_err()
                .contains("accepted values")
        );
        let _ = fs::remove_dir_all(&parent);
    }

    #[test]
    pub fn a_relative_parent_is_refused() {
        let error = create_project(
            "relative/dir".to_string(),
            "demo".to_string(),
            "rust-bin".to_string(),
            String::new(),
        )
        .unwrap_err();
        assert!(error.contains("absolute"), "{error}");
    }
}
