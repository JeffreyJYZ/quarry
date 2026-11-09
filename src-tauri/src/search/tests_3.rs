#![allow(unused_imports)]

pub(crate) use crate::ignore;
pub(crate) use crate::types::{SearchMatch, SearchReport};
pub use regex::RegexBuilder;
pub use serde_json::Value;
pub use std::env;
pub use std::fs;
pub use std::io::{BufRead, BufReader, Read};
pub use std::path::{Path, PathBuf};
pub use std::process::{Child, Command, ExitStatus, Stdio};
pub use std::thread::{self, JoinHandle};
pub use std::time::Instant;

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_3 {
    use super::*;

    /// Replace writes through a sibling temp and a rename, so a failure leaves the source file
    /// whole and still parseable instead of half-written.
    #[cfg(unix)]
    #[test]
    pub fn a_failed_replace_leaves_the_file_parseable() {
        use std::os::unix::fs::PermissionsExt;

        if unsafe { libc::geteuid() } == 0 {
            return;
        }

        let dir = crate::test_support::TempDir::new("replace-failure");
        let path = dir.path().join("data.json");
        let original = "{\n  \"name\": \"old\"\n}\n";
        fs::write(&path, original).expect("write original");

        fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o555))
            .expect("make the directory reject new files");

        let root = dir.path().to_string_lossy().into_owned();
        let report = replace(&root, "old", "new", true, true).expect("the walk itself succeeds");

        fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o755))
            .expect("restore the directory mode");

        assert_eq!(report.files_changed, 0);
        assert_eq!(report.replacements, 0);
        assert_eq!(report.errors.len(), 1, "errors: {:?}", report.errors);
        assert_eq!(
            fs::read_to_string(&path).expect("read"),
            original,
            "a failed replace must leave the original bytes"
        );
        assert!(
            serde_json::from_str::<serde_json::Value>(&fs::read_to_string(&path).expect("read"))
                .is_ok(),
            "the file is still valid JSON"
        );
    }
}
