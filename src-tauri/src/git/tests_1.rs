#![allow(unused_imports)]

pub(crate) use crate::resolve;
pub(crate) use crate::types::{GitFileDiff, GitStatus, GitStatusEntry};
pub use serde::Serialize;
pub use std::fs;
pub use std::path::Path;
pub use std::process::Command;

use super::*;

/// Finds git on `PATH`, then through `xcrun`, like the toolchain probe does.
pub fn git_program() -> Result<String, String> {
    if let Some(found) = resolve::resolve(GIT_PROGRAM) {
        return Ok(found.path.to_string_lossy().into_owned());
    }
    Err(format!(
        "{GIT_PROGRAM} is not installed: it is not on PATH and xcrun cannot find it"
    ))
}
#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_1 {
    use super::*;

    pub const ROOT: &str = "/projects/demo";

    /// Porcelain=v2 stream with every entry shape the parser must know.
    pub const FIXTURE: &str = concat!(
        "# branch.oid 1111111111111111111111111111111111111111\n",
        "# branch.head main\n",
        "# branch.upstream origin/main\n",
        "# branch.ab +2 -1\n",
        "1 M. N... 100644 100644 100644 aaa bbb staged.rs\n",
        "1 .M N... 100644 100644 100644 ccc ddd unstaged.rs\n",
        "? untracked.rs\n",
        "2 R. N... 100644 100644 100644 eee fff R100 new.rs\told.rs\n",
        "u UU N... 100644 100644 100644 100644 ggg hhh ijj conflict.rs\n",
    );

    #[test]
    pub fn status_parses_branch_counts_and_entries() {
        let parts = parse_status(FIXTURE);

        assert_eq!(parts.branch.as_deref(), Some("main"));
        assert_eq!(parts.ahead, 2);
        assert_eq!(parts.behind, 1);
        assert_eq!(parts.entries.len(), 5);

        assert_eq!(parts.entries[0].path, "staged.rs");
        assert_eq!(parts.entries[0].status, STATUS_MODIFIED);
        assert!(parts.entries[0].staged);

        assert_eq!(parts.entries[1].path, "unstaged.rs");
        assert_eq!(parts.entries[1].status, STATUS_MODIFIED);
        assert!(!parts.entries[1].staged);

        assert_eq!(parts.entries[2].path, "untracked.rs");
        assert_eq!(parts.entries[2].status, STATUS_UNTRACKED);
        assert!(!parts.entries[2].staged);

        assert_eq!(parts.entries[3].path, "new.rs");
        assert_eq!(parts.entries[3].status, STATUS_RENAMED);
        assert!(parts.entries[3].staged);

        assert_eq!(parts.entries[4].path, "conflict.rs");
        assert_eq!(parts.entries[4].status, STATUS_CONFLICTED);
        assert!(parts.entries[4].staged);
    }

    #[test]
    pub fn ahead_and_behind_survive_a_missing_branch_ab_line() {
        let parts = parse_status("# branch.head main\n1 .M N... 100644 100644 100644 a b c\n");
        assert_eq!(parts.ahead, 0);
        assert_eq!(parts.behind, 0);
    }

    #[test]
    pub fn a_detached_head_has_no_branch() {
        let parts = parse_status("# branch.head (detached)\n");
        assert_eq!(parts.branch, None);
    }

    #[test]
    pub fn not_a_repository_is_recognised_and_maps_to_an_empty_status() {
        assert!(is_not_a_repository(
            "fatal: not a git repository (or any of the parent directories): .git\n"
        ));
        assert!(!is_not_a_repository("fatal: something else went wrong\n"));
    }

    #[test]
    pub fn entry_paths_are_joined_onto_the_root() {
        assert_eq!(
            absolute_path(ROOT, "src/main.rs"),
            "/projects/demo/src/main.rs"
        );
        assert_eq!(absolute_path(ROOT, "a b/c.rs"), "/projects/demo/a b/c.rs");
    }

    #[test]
    pub fn relative_path_strips_the_root_from_an_absolute_path() {
        assert_eq!(
            relative_path(ROOT, "/projects/demo/src/main.rs"),
            "src/main.rs"
        );
        assert_eq!(relative_path(ROOT, "src/main.rs"), "src/main.rs");
        assert_eq!(
            relative_path(ROOT, "/elsewhere/main.rs"),
            "/elsewhere/main.rs"
        );
    }

    #[test]
    pub fn a_binary_diff_has_no_hunk() {
        let diff = "diff --git a/logo.png b/logo.png\nindex 111..222 100644\nBinary files a/logo.png and b/logo.png differ\n";
        assert!(!has_hunk(diff));

        let text = "diff --git a/main.rs b/main.rs\nindex 111..222 100644\n--- a/main.rs\n+++ b/main.rs\n@@ -1,2 +1,2 @@\n-old\n+new\n";
        assert!(has_hunk(text));
    }

    #[test]
    pub fn an_untracked_file_becomes_one_added_hunk() {
        let diff = untracked_diff("new.rs", "fn main() {}\nlet x = 1;\n");

        assert!(diff.starts_with("diff --git a/new.rs b/new.rs\n"));
        assert!(diff.contains("new file mode 100644\n"));
        assert!(diff.contains("--- /dev/null\n"));
        assert!(diff.contains("+++ b/new.rs\n"));
        assert!(diff.contains("@@ -0,0 +1,2 @@\n"));
        assert!(diff.ends_with("+fn main() {}\n+let x = 1;\n"));
    }

    #[test]
    pub fn an_empty_untracked_file_has_no_hunk() {
        let diff = untracked_diff("empty.rs", "");
        assert!(diff.contains("+++ b/empty.rs\n"));
        assert!(!diff.contains("@@"));
    }

    #[test]
    pub fn status_codes_map_onto_names() {
        assert_eq!(status_name('M'), Some(STATUS_MODIFIED));
        assert_eq!(status_name('A'), Some(STATUS_ADDED));
        assert_eq!(status_name('D'), Some(STATUS_DELETED));
        assert_eq!(status_name('R'), Some(STATUS_RENAMED));
        assert_eq!(status_name('U'), Some(STATUS_CONFLICTED));
        assert_eq!(status_name('u'), Some(STATUS_CONFLICTED));
        assert_eq!(status_name('?'), Some(STATUS_UNTRACKED));
        assert_eq!(status_name('.'), None);
    }
}
