#![allow(unused_imports)]

pub use std::collections::HashSet;
pub use std::env;
pub use std::ffi::OsString;
pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::process::Command;

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_1 {
    use super::*;

    use crate::test_support::{TempDir, with_path};

    #[test]
    pub fn on_path_finds_an_executable_and_rejects_a_plain_file() {
        let directory = TempDir::new("exec");
        let executable = directory.file("quarry-tool-exec", true);
        let plain = directory.file("quarry-tool-plain", false);
        let path = directory.path().to_string_lossy().into_owned();

        with_path(&path, || {
            assert_eq!(
                on_path("quarry-tool-exec"),
                Some(executable.clone()),
                "an executable file on PATH is found"
            );
            assert_eq!(
                on_path("quarry-tool-plain"),
                None,
                "a file without an exec bit is not a hit"
            );
        });

        assert!(plain.exists());
    }

    #[test]
    pub fn earlier_path_entries_win() {
        let first = TempDir::new("first");
        let second = TempDir::new("second");
        let first_tool = first.file("quarry-tool-dup", true);
        let second_tool = second.file("quarry-tool-dup", true);
        let path = format!(
            "{}:{}",
            first.path().to_string_lossy(),
            second.path().to_string_lossy()
        );

        with_path(&path, || {
            assert_eq!(on_path("quarry-tool-dup"), Some(first_tool));
        });

        assert!(second_tool.exists());
    }
}
