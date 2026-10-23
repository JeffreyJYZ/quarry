#![allow(unused_imports)]

pub(crate) use crate::resolve;
pub(crate) use crate::types::{GitFileDiff, GitStatus, GitStatusEntry};
pub use serde::Serialize;
pub use std::fs;
pub use std::path::Path;
pub use std::process::Command;

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_2 {
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
    pub fn errors_name_the_operation_and_the_first_stderr_line() {
        let error = operation_error("git status", "fatal: bad usage\nsecond line\n");
        assert_eq!(error, "git status failed: fatal: bad usage");

        let long = "e".repeat(ERROR_LIMIT + 100);
        let error = operation_error("git diff", &long);
        assert!(error.starts_with("git diff failed: "));
        assert_eq!(
            error.chars().count(),
            "git diff failed: ".len() + ERROR_LIMIT
        );
    }

    #[test]
    pub fn quoted_paths_are_unquoted() {
        assert_eq!(unquote_path("plain.rs"), "plain.rs");
        assert_eq!(unquote_path("\"with space.rs\""), "with space.rs");
        assert_eq!(unquote_path("\"tab\\there.rs\""), "tab\there.rs");
    }

    #[test]
    pub fn commit_message_rejects_empty_and_whitespace() {
        assert!(validate_commit_message("").is_err());
        assert!(validate_commit_message("   \n\t").is_err());
    }

    #[test]
    pub fn commit_message_rejects_oversized() {
        let message = "a".repeat(4097);
        assert!(validate_commit_message(&message).is_err());
    }

    #[test]
    pub fn commit_message_accepts_normal() {
        assert!(validate_commit_message("fix: thing").is_ok());
    }

    #[test]
    pub fn commit_argv_keeps_a_leading_dash_as_the_value_of_m() {
        let argv = commit_argv("-foo");
        assert_eq!(argv, vec!["commit", "-m", "-foo"]);
    }

    #[test]
    pub fn commit_hash_too_short_is_rejected() {
        assert!(validate_commit_hash("abc").is_err());
    }

    #[test]
    pub fn commit_hash_non_hex_is_rejected() {
        assert!(validate_commit_hash("zzzz").is_err());
    }

    #[test]
    pub fn commit_hash_40_hex_is_accepted() {
        let hash = "a".repeat(40);
        assert!(validate_commit_hash(&hash).is_ok());
    }

    #[test]
    pub fn binary_diff_detects_binary_files_fixture() {
        let output = "diff --git a/logo.png b/logo.png\nindex 111..222\nBinary files a/logo.png and b/logo.png differ\n";
        assert!(is_binary_diff(output));
    }

    #[test]
    pub fn binary_diff_detects_empty_diff() {
        assert!(is_binary_diff(""));
    }

    #[test]
    pub fn commit_diff_argv_builds_expected() {
        let argv = commit_diff_argv("abc123");
        assert_eq!(
            argv,
            vec!["show", "--no-color", "--unified=3", "--format=", "abc123"]
        );
    }

    #[test]
    pub fn discard_path_outside_project_is_refused() {
        assert!(validate_path(ROOT, "/elsewhere/secret.rs").is_err());
    }

    #[test]
    pub fn amend_message_rejects_empty() {
        assert!(validate_commit_message("").is_err());
        assert!(validate_commit_message("   ").is_err());
    }

    #[test]
    pub fn amend_argv_builds_expected() {
        let argv = amend_argv("fix: thing");
        assert_eq!(argv, vec!["commit", "--amend", "-m", "fix: thing"]);
    }

    #[test]
    pub fn hunk_id_stable() {
        let diff = "@@ -1,2 +1,2 @@\n-old\n+new\n";
        let h = split_hunks(diff);
        assert_eq!(h.len(), 1);
        let id1 = hunk_id(
            &h[0].0,
            &h[0].1.iter().map(String::as_str).collect::<Vec<_>>(),
        );
        let id2 = hunk_id(
            &h[0].0,
            &h[0].1.iter().map(String::as_str).collect::<Vec<_>>(),
        );
        assert_eq!(id1, id2);
    }
}
