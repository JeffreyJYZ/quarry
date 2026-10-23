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
pub mod tests_group_2 {
    use super::*;

    pub const ROOT: &str = "/projects/demo";

    pub fn root() -> &'static Path {
        Path::new(ROOT)
    }

    /// One line with a trailing newline, a submatch at byte 16 and line number 12.
    pub const MATCH: &str = r#"{"type":"match","data":{"path":{"text":"/projects/demo/src/main.rs"},"lines":{"text":"    let found = search_project(root);\n"},"line_number":12,"absolute_offset":0,"submatches":[{"match":{"text":"search_project"},"start":16,"end":30}]}}"#;

    #[test]
    pub fn empty_queries_are_rejected_by_name() {
        assert!(require_query("").is_err());
        assert!(require_query(" \n\t ").is_err());
        assert_eq!(require_query("needle").as_deref(), Ok("needle"));
    }

    #[test]
    pub fn search_command_argv_default() {
        let cmd = search_command("rg", root(), "needle", false, false);
        let args: Vec<String> = cmd
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            args,
            vec![
                "--json",
                "--line-number",
                "--smart-case",
                "--no-heading",
                "--color=never",
                "-g",
                "!target",
                "-g",
                "!node_modules",
                "-g",
                "!dist",
                "-g",
                "!.git",
                "-g",
                "!.quarry",
                "-e",
                "needle",
                "/projects/demo",
            ]
        );
    }

    #[test]
    pub fn search_command_argv_case_sensitive() {
        let cmd = search_command("rg", root(), "needle", true, false);
        let args: Vec<String> = cmd
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert!(args.contains(&"--case-sensitive".to_string()));
        assert!(!args.contains(&"--smart-case".to_string()));
    }

    #[test]
    pub fn search_command_argv_fixed_strings() {
        let cmd = search_command("rg", root(), "needle", false, true);
        let args: Vec<String> = cmd
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert!(args.contains(&"--fixed-strings".to_string()));
    }

    #[test]
    pub fn search_command_argv_both() {
        let cmd = search_command("rg", root(), "needle", true, true);
        let args: Vec<String> = cmd
            .get_args()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        assert!(args.contains(&"--case-sensitive".to_string()));
        assert!(args.contains(&"--fixed-strings".to_string()));
        assert!(!args.contains(&"--smart-case".to_string()));
    }
}
