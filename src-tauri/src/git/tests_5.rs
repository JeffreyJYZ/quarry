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

    use crate::test_support::TempDir;

    /// Runs one git command in `root`, or names the command that could not run.
    fn git(root: &str, args: &[&str]) -> Result<std::process::Output, String> {
        run(&git_program()?, root, args)
    }

    /// Git's own refusal, for an assertion message that says why the patch was rejected.
    fn refusal(output: &std::process::Output) -> String {
        String::from_utf8_lossy(&output.stderr).into_owned()
    }

    /// Stages the one-hunk patch of `path` as an untracked file in a real repository and returns
    /// the name the index ended up with. Fails the same way the app would: `git apply` is the judge.
    fn stage_untracked(path: &str) -> Result<String, String> {
        let directory = TempDir::new("untracked-diff");
        let root = directory.path().to_string_lossy().into_owned();
        if let Some(parent) = Path::new(path).parent() {
            fs::create_dir_all(directory.path().join(parent)).map_err(|error| error.to_string())?;
        }
        fs::write(directory.path().join(path), "hello\n").map_err(|error| error.to_string())?;

        let init = git(&root, &["init", "-q", "."])?;
        if !init.status.success() {
            return Err(refusal(&init));
        }

        let patch_file = directory.path().join("hunk.patch");
        let patch = untracked_diff(path, "hello\n");
        fs::write(&patch_file, &patch).map_err(|error| error.to_string())?;
        let patch_file = patch_file.to_string_lossy().into_owned();

        let checked = git(&root, &["apply", "--check", "--cached", &patch_file])?;
        if !checked.status.success() {
            return Err(format!("{patch}git apply --check: {}", refusal(&checked)));
        }
        let applied = git(&root, &["apply", "--cached", &patch_file])?;
        if !applied.status.success() {
            return Err(format!("{patch}git apply: {}", refusal(&applied)));
        }

        let staged = git(&root, &["diff", "--cached", "--name-only", "-z"])?;
        Ok(String::from_utf8_lossy(&staged.stdout)
            .trim_end_matches('\0')
            .to_string())
    }

    #[test]
    pub fn a_name_with_a_space_stages_under_its_own_name() {
        assert_eq!(
            stage_untracked("with space.txt"),
            Ok("with space.txt".to_string())
        );
        assert_eq!(
            stage_untracked("dir with space/file.txt"),
            Ok("dir with space/file.txt".to_string())
        );
    }

    #[test]
    pub fn a_non_ascii_name_stages_under_its_own_name() {
        assert_eq!(stage_untracked("café.txt"), Ok("café.txt".to_string()));
        assert_eq!(
            stage_untracked("日本語 x.txt"),
            Ok("日本語 x.txt".to_string())
        );
    }

    #[test]
    pub fn a_name_git_must_quote_stages_under_its_own_name() {
        assert_eq!(
            stage_untracked("tab\there.txt"),
            Ok("tab\there.txt".to_string())
        );
        assert_eq!(
            stage_untracked("quote\"back\\slash.txt"),
            Ok("quote\"back\\slash.txt".to_string())
        );
    }

    #[test]
    pub fn a_space_name_keeps_gits_own_header_form() {
        let diff = untracked_diff("with space.txt", "hello\n");

        assert!(diff.starts_with("diff --git a/with space.txt b/with space.txt\n"));
        assert!(diff.contains("--- /dev/null\n"));
        assert!(diff.contains("+++ b/with space.txt\t\n"), "{diff}");
    }

    #[test]
    pub fn a_non_ascii_name_is_quoted_the_way_git_quotes_it() {
        let diff = untracked_diff("café.txt", "hello\n");

        assert!(
            diff.starts_with("diff --git \"a/caf\\303\\251.txt\" \"b/caf\\303\\251.txt\"\n"),
            "{diff}"
        );
        assert!(diff.contains("+++ \"b/caf\\303\\251.txt\"\n"), "{diff}");
    }

    #[test]
    pub fn a_quoted_name_with_a_space_still_ends_in_a_tab() {
        let diff = untracked_diff("café x.txt", "hello\n");

        assert!(diff.contains("+++ \"b/caf\\303\\251 x.txt\"\t\n"), "{diff}");
    }

    #[test]
    pub fn quote_diff_name_escapes_quotes_backslashes_and_control_bytes() {
        assert_eq!(quote_diff_name("a\"b\\c"), "\"a\\\"b\\\\c\"");
        assert_eq!(quote_diff_name("a\tb"), "\"a\\tb\"");
        assert_eq!(quote_diff_name("a\u{7f}b"), "\"a\\177b\"");
    }
}

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_hunk_patch {
    use super::*;

    const PATCH: &str = "diff --git a/notes.txt b/notes.txt\n@@ -1 +1 @@\n-old\n+new\n";

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
