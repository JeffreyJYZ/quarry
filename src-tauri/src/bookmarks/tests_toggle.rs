#![allow(unused_imports)]

pub use std::fs;
pub use std::path::PathBuf;

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod toggle_group {
    use super::*;
    use crate::atomic_write::TempDir;

    /// A throwaway project with one two-line source file.
    pub fn project(label: &str) -> TempDir {
        let dir =
            TempDir::create(&format!("quarry-bookmarks-{label}")).expect("creates a temp dir");
        fs::create_dir_all(dir.path().join("src")).expect("creates src");
        fs::write(dir.path().join("src").join("main.rs"), "fn main() {\n}\n")
            .expect("writes the source file");
        dir
    }

    fn root(dir: &TempDir) -> String {
        dir.path().display().to_string()
    }

    fn source(dir: &TempDir) -> String {
        dir.path().join("src").join("main.rs").display().to_string()
    }

    #[test]
    fn toggling_a_line_adds_it_then_takes_it_away() {
        let dir = project("toggle-round-trip");
        let added = toggle_bookmark(root(&dir), source(&dir), 1).expect("adds the bookmark");
        assert_eq!(added.len(), 1);
        assert_eq!(added[0].line, 1);
        assert_eq!(added[0].text, "fn main() {");

        let removed = toggle_bookmark(root(&dir), source(&dir), 1).expect("removes it");
        assert!(removed.is_empty());
    }

    #[test]
    fn toggling_twice_off_leaves_no_duplicate_after_a_re_add() {
        let dir = project("toggle-twice");
        toggle_bookmark(root(&dir), source(&dir), 2).expect("adds");
        toggle_bookmark(root(&dir), source(&dir), 2).expect("removes");
        let again = toggle_bookmark(root(&dir), source(&dir), 2).expect("adds again");
        assert_eq!(again.len(), 1);
        assert_eq!(again[0].line, 2);
    }

    #[test]
    fn line_zero_is_refused() {
        let dir = project("toggle-zero");
        let error = toggle_bookmark(root(&dir), source(&dir), 0).unwrap_err();
        assert!(error.contains("1-based"), "{error}");
    }

    #[test]
    fn a_path_outside_the_project_is_refused() {
        let dir = project("toggle-outside");
        let outside = dir.path().parent().unwrap().join("elsewhere.rs");
        let error = toggle_bookmark(root(&dir), outside.display().to_string(), 1).unwrap_err();
        assert!(error.contains("not inside"), "{error}");
    }
}
