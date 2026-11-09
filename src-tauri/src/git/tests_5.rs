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
pub mod tests_group_5 {
    use super::*;

    const PATCH: &str = "diff --git a/notes.txt b/notes.txt\n@@ -1 +1 @@\n-old\n+new\n";

    /// The old code wrote to the shared name `quarry-hunk-<id>.patch`, so a symlink planted there
    /// redirected the patch and git then read whatever the victim held. The private directory and
    /// `create_new` file make that path unreachable.
    #[cfg(unix)]
    #[test]
    pub fn a_planted_symlink_at_the_shared_name_is_not_followed() {
        use std::os::unix::fs::symlink;

        let dir = crate::test_support::TempDir::new("hunk-symlink");
        let victim = dir.path().join("victim.txt");
        fs::write(&victim, "victim bytes").expect("write victim");

        let planted = std::env::temp_dir().join(format!(
            "quarry-hunk-{}-{}.patch",
            "0123abcd",
            std::process::id()
        ));
        let _ = fs::remove_file(&planted);
        symlink(&victim, &planted).expect("plant symlink");

        let written = write_hunk_patch(PATCH).expect("write patch");

        assert_eq!(
            fs::read_to_string(written.path()).expect("read patch"),
            PATCH
        );
        assert_eq!(
            fs::read_to_string(&victim).expect("read victim"),
            "victim bytes",
            "the planted symlink must not receive the patch"
        );
        assert_ne!(
            written.path().parent(),
            Some(std::env::temp_dir().as_path()),
            "the patch belongs to a private directory, not the shared temp dir"
        );

        let private = written.directory().to_path_buf();
        drop(written);
        assert!(
            !private.exists(),
            "dropping the handle removes the private directory"
        );

        let _ = fs::remove_file(&planted);
    }

    #[test]
    pub fn each_patch_gets_its_own_directory() {
        let first = write_hunk_patch(PATCH).expect("first patch");
        let second = write_hunk_patch(PATCH).expect("second patch");

        assert_ne!(first.directory(), second.directory());
        assert_eq!(fs::read_to_string(first.path()).expect("read"), PATCH);
        assert_eq!(fs::read_to_string(second.path()).expect("read"), PATCH);
    }
}
