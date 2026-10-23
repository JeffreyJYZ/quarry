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
pub mod tests_group_3 {
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
    pub fn build_hunk_patch_single() {
        let diff = "diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1,2 +1,2 @@\n-old\n+new\n";
        let id = {
            let h = split_hunks(diff);
            hunk_id(
                &h[0].0,
                &h[0].1.iter().map(String::as_str).collect::<Vec<_>>(),
            )
        };
        let patch = build_hunk_patch(diff, &id).unwrap();
        assert!(patch.contains("@@ -1,2 +1,2 @@"));
        assert!(patch.contains("-old"));
    }

    #[test]
    pub fn build_hunk_patch_stale_returns_none() {
        let diff = "diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1,2 +1,2 @@\n-old\n+new\n";
        assert!(build_hunk_patch(diff, "deadbeef").is_none());
    }
}
