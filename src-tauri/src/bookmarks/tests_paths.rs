#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod paths_group {
    use super::*;
    use crate::atomic_write::TempDir;

    fn project(label: &str) -> TempDir {
        let dir =
            TempDir::create(&format!("quarry-bookmarks-{label}")).expect("creates a temp dir");
        fs::create_dir_all(dir.path().join("src")).expect("creates src");
        dir
    }

    #[test]
    fn a_nested_file_becomes_a_slash_path() {
        let dir = project("paths-nested");
        let file = dir.path().join("src").join("main.rs");
        assert_eq!(
            relative_path(dir.path(), &file.display().to_string()).unwrap(),
            "src/main.rs"
        );
    }

    #[test]
    fn a_relative_path_joins_back_onto_the_root() {
        let dir = project("paths-join");
        let joined = absolute_path(dir.path(), "src/main.rs");
        assert_eq!(joined, dir.path().join("src").join("main.rs"));
    }

    #[test]
    fn the_root_itself_is_not_a_file() {
        let dir = project("paths-root");
        let error = relative_path(dir.path(), &dir.path().display().to_string()).unwrap_err();
        assert!(error.contains("not a file"), "{error}");
    }

    #[test]
    fn an_outside_path_has_no_relative_form() {
        let dir = project("paths-outside");
        let outside = dir.path().parent().unwrap().join("other.rs");
        assert!(relative_path(dir.path(), &outside.display().to_string()).is_err());
    }

    #[test]
    fn entries_drop_empty_paths_and_line_zero_and_sort() {
        let entries = normalize_entries(vec![
            BookmarkEntry {
                path: "b.rs".to_string(),
                line: 4,
            },
            BookmarkEntry {
                path: "a.rs".to_string(),
                line: 9,
            },
            BookmarkEntry {
                path: "a.rs".to_string(),
                line: 9,
            },
            BookmarkEntry {
                path: "".to_string(),
                line: 1,
            },
            BookmarkEntry {
                path: "a.rs".to_string(),
                line: 0,
            },
        ]);
        assert_eq!(
            entries,
            vec![
                BookmarkEntry {
                    path: "a.rs".to_string(),
                    line: 9,
                },
                BookmarkEntry {
                    path: "b.rs".to_string(),
                    line: 4,
                },
            ]
        );
    }
}
