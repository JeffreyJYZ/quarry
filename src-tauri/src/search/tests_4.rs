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
pub mod tests_group_4 {
    use super::*;

    fn report(root: &Path, query: &str, replacement: &str, fixed: bool) -> ReplaceReport {
        replace(root.to_str().unwrap(), query, replacement, false, fixed).unwrap()
    }

    /// The bug this pins: `.` matched the `\r` of a CRLF pair, so a pattern reaching the line end
    /// swallowed the terminator and the whole file was rewritten as LF.
    #[test]
    pub fn a_whole_line_replace_keeps_crlf_terminators() {
        let dir = crate::test_support::TempDir::new("replace-crlf");
        let path = dir.path().join("windows.txt");
        fs::write(&path, "alpha\r\nbeta\r\ngamma\r\n").expect("write");

        let report = report(dir.path(), "alpha.*", "delta", false);

        assert_eq!(report.files_changed, 1);
        assert_eq!(report.replacements, 1);
        assert_eq!(
            fs::read_to_string(&path).expect("read"),
            "delta\r\nbeta\r\ngamma\r\n"
        );
    }

    /// A file that uses a lone `\r` as its terminator must not be flattened either.
    #[test]
    pub fn a_lone_carriage_return_is_kept() {
        let dir = crate::test_support::TempDir::new("replace-cr");
        let path = dir.path().join("classic.txt");
        fs::write(&path, "alpha\rbeta\r").expect("write");

        let result = report(dir.path(), "alpha.*", "delta", false);

        assert_eq!(result.replacements, 1);
        assert_eq!(fs::read_to_string(&path).expect("read"), "delta\rbeta\r");
    }

    /// The bug this pins: a fixed-string replacement was handed to `replace_all`, so `$1` expanded
    /// to an empty group instead of the characters the user typed.
    #[test]
    pub fn a_literal_replacement_is_inserted_verbatim() {
        let dir = crate::test_support::TempDir::new("replace-literal");
        let path = dir.path().join("price.txt");
        fs::write(&path, "price 10\n").expect("write");

        let result = report(dir.path(), "10", "$1", true);

        assert_eq!(result.replacements, 1);
        assert_eq!(fs::read_to_string(&path).expect("read"), "price $1\n");
    }

    /// A symlinked directory points outside the project, so the walk must not follow it.
    #[cfg(unix)]
    #[test]
    pub fn a_symlinked_directory_is_not_entered() {
        use std::os::unix::fs::symlink;

        let dir = crate::test_support::TempDir::new("replace-symlink-dir");
        let project = dir.path().join("project");
        let outside = dir.path().join("outside");
        fs::create_dir_all(&project).expect("project");
        fs::create_dir_all(&outside).expect("outside");
        fs::write(project.join("kept.txt"), "foo\n").expect("kept");
        fs::write(outside.join("secret.txt"), "foo\n").expect("secret");
        symlink(&outside, project.join("link")).expect("symlink the outside directory");

        let result = report(&project, "foo", "qux", true);

        assert_eq!(result.files_changed, 1);
        assert_eq!(
            fs::read_to_string(outside.join("secret.txt")).expect("read"),
            "foo\n",
            "a file behind a symlinked directory must not be edited"
        );
        assert_eq!(
            fs::read_to_string(project.join("kept.txt")).expect("read"),
            "qux\n"
        );
    }

    /// A symlinked file is written through to its target, which may be outside the project.
    #[cfg(unix)]
    #[test]
    pub fn a_symlinked_file_is_not_rewritten() {
        use std::os::unix::fs::symlink;

        let dir = crate::test_support::TempDir::new("replace-symlink-file");
        let project = dir.path().join("project");
        let outside = dir.path().join("outside");
        fs::create_dir_all(&project).expect("project");
        fs::create_dir_all(&outside).expect("outside");
        fs::write(outside.join("target.txt"), "foo\n").expect("target");
        symlink(outside.join("target.txt"), project.join("leak.txt")).expect("symlink the file");

        let result = report(&project, "foo", "qux", true);

        assert_eq!(result.files_changed, 0);
        assert_eq!(
            fs::read_to_string(outside.join("target.txt")).expect("read"),
            "foo\n"
        );
    }
}
