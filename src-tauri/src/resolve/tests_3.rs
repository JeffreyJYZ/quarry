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
pub mod tests_group_3 {
    use super::*;

    use crate::test_support::{TempDir, with_path};

    #[test]
    pub fn resolve_prefers_a_path_hit_over_xcrun() {
        let directory = TempDir::new("prefer");
        let tool = directory.file("quarry-tool-prefer", true);
        let path = directory.path().to_string_lossy().into_owned();

        with_path(&path, || {
            let resolved = resolve("quarry-tool-prefer").expect("the tool is on PATH");
            assert_eq!(resolved.source, Source::Path);
            assert_eq!(resolved.path, tool);
            assert_eq!(resolved.name, "quarry-tool-prefer");
        });
    }

    #[test]
    pub fn xcrun_output_parses_to_the_first_line() {
        assert_eq!(
            parse_xcrun_stdout(b"/usr/bin/clangd\n"),
            Some(PathBuf::from("/usr/bin/clangd"))
        );
        assert_eq!(
            parse_xcrun_stdout(b"  /usr/bin/clangd  \nignored\n"),
            Some(PathBuf::from("/usr/bin/clangd"))
        );
        assert_eq!(parse_xcrun_stdout(b"\n"), None);
        assert_eq!(parse_xcrun_stdout(b""), None);
    }

    #[test]
    pub fn a_missing_xcrun_is_not_an_error() {
        // An empty PATH means `xcrun` itself cannot be spawned, so nothing runs.
        with_path("", || {
            assert!(via_xcrun("quarry-tool-that-does-not-exist").is_none());
            assert!(resolve("quarry-tool-that-does-not-exist").is_none());
        });
    }
}
