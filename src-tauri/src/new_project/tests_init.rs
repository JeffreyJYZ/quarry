#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::ProjectInfo;
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_init_group {
    use super::*;

    fn scratch(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("quarry-init-{}-{label}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("creates the scratch directory");
        dir
    }

    fn init(root: &Path, kind: &str) -> Result<ProjectInfo, String> {
        init_with(root, kind, "")
    }

    fn init_with(root: &Path, kind: &str, standard: &str) -> Result<ProjectInfo, String> {
        init_project(
            root.display().to_string(),
            kind.to_string(),
            standard.to_string(),
        )
    }

    #[test]
    fn init_writes_each_kind_into_the_root() {
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
            let root = scratch(kind);
            let name = root.file_name().unwrap().to_string_lossy().into_owned();
            let info = init(&root, kind).expect("initializes");
            assert!(
                !root.join(&name).join(entry).exists(),
                "{kind} nested inside a subdirectory"
            );
            assert!(
                root.join(entry).is_file(),
                "{kind} did not write {entry} in root"
            );
            assert_eq!(info.kind, expected, "{kind} detected wrong");
            if kind.ends_with("cmake") {
                let manifest = fs::read_to_string(root.join("CMakeLists.txt")).expect("reads");
                let language = if kind == "c-cmake" { "C" } else { "CXX" };
                assert!(
                    manifest.contains(&format!("project({name} {language})")),
                    "{manifest}"
                );
            }
            let _ = fs::remove_dir_all(&root);
        }
    }

    #[test]
    fn init_uses_the_directory_name_as_project_name() {
        let parent = scratch("name");
        let root = parent.join("mylib");
        fs::create_dir(&root).expect("creates root");
        let info = init(&root, "rust-lib").expect("initializes");
        assert_eq!(info.name, "mylib", "name should come from the directory");
        let manifest = fs::read_to_string(root.join("Cargo.toml")).expect("reads");
        assert!(manifest.contains("name = \"mylib\""), "{manifest}");
        let _ = fs::remove_dir_all(&parent);
    }

    #[test]
    fn init_returns_what_open_project_returns() {
        let root = scratch("reopen");
        let info = init(&root, "rust-bin").expect("initializes");
        let reopened = project::open_project(root.display().to_string()).expect("reopens");
        assert_eq!(info.root, reopened.root);
        assert_eq!(info.opened_root, reopened.opened_root);
        assert_eq!(info.name, reopened.name);
        assert_eq!(info.kind, reopened.kind);
        assert_eq!(info.build_root, reopened.build_root);
        assert_eq!(info.launch_config, reopened.launch_config);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn init_refuses_a_relative_or_missing_root() {
        let error = init_project(
            "relative/dir".to_string(),
            "rust-bin".to_string(),
            String::new(),
        )
        .unwrap_err();
        assert!(error.contains("absolute"), "{error}");

        let root = scratch("missing-root");
        let missing = root.join("nope");
        let error = init_with(&missing, "rust-bin", "").unwrap_err();
        assert!(error.contains("directory"), "{error}");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn init_refuses_a_directory_with_meaningful_content() {
        let root = scratch("occupied");
        fs::write(root.join("notes.txt"), "hi").expect("writes stray file");
        let error = init(&root, "rust-bin").unwrap_err();
        assert!(error.contains("already holds"), "{error}");
        assert!(error.contains("notes.txt"), "{error}");
        assert!(
            !root.join("Cargo.toml").exists(),
            "must write nothing on refusal"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn init_names_at_most_three_offenders() {
        let root = scratch("many");
        for i in 0..5 {
            fs::write(root.join(format!("file{i}")), "x").expect("writes stray file");
        }
        let error = init(&root, "rust-bin").unwrap_err();
        let named: Vec<usize> = (0..5)
            .filter(|i| error.contains(&format!("file{i}")))
            .collect();
        assert!(!named.is_empty() && named.len() <= 3, "{error}");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn init_allows_quarry_git_and_ds_store_occupants() {
        let root = scratch("allowed");
        fs::create_dir(root.join(".quarry")).expect("creates .quarry");
        fs::write(root.join(".quarry/launch.json"), "{}").expect("writes state");
        fs::create_dir(root.join(".git")).expect("creates .git");
        fs::write(root.join(".DS_Store"), "x").expect("writes finder file");
        init(&root, "rust-bin").expect("initializes around the allowed entries");
        assert!(root.join("Cargo.toml").is_file());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn init_never_overwrites_an_existing_file() {
        let root = scratch("no-overwrite");
        fs::write(root.join("Cargo.toml"), "keep me").expect("writes existing file");
        let error = write_new_file(&root, "Cargo.toml", "replacement").unwrap_err();
        assert!(error.contains("already holds"), "{error}");
        assert_eq!(
            fs::read_to_string(root.join("Cargo.toml")).unwrap(),
            "keep me"
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn init_refuses_unknown_kind_with_the_existing_refusal_text() {
        let root = scratch("bad-kind");
        let error = init(&root, "kotlin").unwrap_err();
        assert!(error.contains("accepted values"), "{error}");
        assert!(error.contains("rust-bin"), "{error}");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn init_refuses_a_standard_from_the_wrong_language() {
        let root = scratch("bad-standard");
        let error = init_with(&root, "c-cmake", "20").unwrap_err();
        assert!(error.contains("not available"), "{error}");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn init_standard_reaches_the_manifest() {
        let root = scratch("standard");
        init_with(&root, "rust-bin", "2021").expect("initializes");
        let manifest = fs::read_to_string(root.join("Cargo.toml")).expect("reads");
        assert!(manifest.contains("edition = \"2021\""), "{manifest}");
        let _ = fs::remove_dir_all(&root);
    }
}
