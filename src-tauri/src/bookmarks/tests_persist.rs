#![allow(unused_imports)]

pub use std::fs;
pub use std::path::PathBuf;

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod persist_group {
    use super::*;
    use crate::atomic_write::TempDir;

    /// A throwaway project with `a.rs` and `src/b.rs`, one line each at least.
    pub fn project(label: &str) -> TempDir {
        let dir =
            TempDir::create(&format!("quarry-bookmarks-{label}")).expect("creates a temp dir");
        fs::create_dir_all(dir.path().join("src")).expect("creates src");
        fs::write(dir.path().join("a.rs"), "alpha\nsecond\n").expect("writes a.rs");
        fs::write(dir.path().join("src").join("b.rs"), "beta\n").expect("writes b.rs");
        dir
    }

    fn root(dir: &TempDir) -> String {
        dir.path().display().to_string()
    }

    fn file(dir: &TempDir, name: &str) -> String {
        dir.path().join(name).display().to_string()
    }

    #[test]
    fn a_saved_bookmark_survives_a_reload() {
        let dir = project("reload");
        toggle_bookmark(root(&dir), file(&dir, "a.rs"), 2).expect("saves");
        let loaded = list_bookmarks(root(&dir)).expect("reads the file back");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].line, 2);
        assert_eq!(loaded[0].text, "second");
        assert_eq!(loaded[0].path, file(&dir, "a.rs"));
    }

    #[test]
    fn the_file_stores_root_relative_paths() {
        let dir = project("relative");
        toggle_bookmark(root(&dir), file(&dir, "src/b.rs"), 1).expect("saves");
        let text = fs::read_to_string(bookmarks_path(dir.path())).expect("reads the json");
        assert!(text.contains("\"path\": \"src/b.rs\""), "{text}");
        assert!(!text.contains(&root(&dir)), "{text}");
    }

    #[test]
    fn a_malformed_file_reads_as_no_bookmarks() {
        let dir = project("malformed");
        fs::create_dir_all(dir.path().join(".quarry")).expect("creates .quarry");
        fs::write(bookmarks_path(dir.path()), "{ not json").expect("writes junk");
        let loaded = list_bookmarks(root(&dir)).expect("does not error");
        assert!(loaded.is_empty());
    }

    #[test]
    fn a_missing_file_is_an_empty_project() {
        let dir = project("missing-file");
        assert!(list_bookmarks(root(&dir)).expect("reads").is_empty());
        assert!(!bookmarks_path(dir.path()).exists());
    }

    #[test]
    fn a_bookmark_on_a_deleted_file_is_dropped() {
        let dir = project("deleted");
        toggle_bookmark(root(&dir), file(&dir, "a.rs"), 1).expect("saves");
        fs::remove_file(dir.path().join("a.rs")).expect("deletes the file");
        let loaded = list_bookmarks(root(&dir)).expect("does not error");
        assert!(loaded.is_empty());
        let kept = read_entries(dir.path());
        assert_eq!(
            kept.len(),
            1,
            "the entry stays on disk until the next write"
        );
    }

    #[test]
    fn rows_are_ordered_by_path_then_line() {
        let dir = project("ordering");
        toggle_bookmark(root(&dir), file(&dir, "src/b.rs"), 1).expect("saves b");
        toggle_bookmark(root(&dir), file(&dir, "a.rs"), 2).expect("saves a:2");
        toggle_bookmark(root(&dir), file(&dir, "a.rs"), 1).expect("saves a:1");
        let loaded = list_bookmarks(root(&dir)).expect("reads");
        let lines: Vec<(String, u32)> = loaded
            .iter()
            .map(|row| (row.path.clone(), row.line))
            .collect();
        assert_eq!(
            lines,
            vec![
                (file(&dir, "a.rs"), 1),
                (file(&dir, "a.rs"), 2),
                (file(&dir, "src/b.rs"), 1),
            ]
        );
    }

    #[test]
    fn clearing_leaves_an_empty_file() {
        let dir = project("clear");
        toggle_bookmark(root(&dir), file(&dir, "a.rs"), 1).expect("saves");
        clear_bookmarks(root(&dir)).expect("clears");
        assert!(list_bookmarks(root(&dir)).expect("reads").is_empty());
        let text = fs::read_to_string(bookmarks_path(dir.path())).expect("reads the json");
        assert!(text.contains("\"bookmarks\": []"), "{text}");
    }
}
