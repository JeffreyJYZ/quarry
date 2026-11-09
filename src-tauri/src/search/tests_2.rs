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
        let mut expected = vec![
            "--json".to_string(),
            "--line-number".to_string(),
            "--smart-case".to_string(),
            "--no-heading".to_string(),
            "--color=never".to_string(),
        ];
        // The exact globs are pinned in `ignore`; here only their placement matters, so search and
        // quick open read the same set without this test restating it.
        for excluded in crate::ignore::ripgrep_excludes() {
            expected.push("-g".to_string());
            expected.push(excluded);
        }
        expected.extend([
            "-e".to_string(),
            "needle".to_string(),
            "/projects/demo".to_string(),
        ]);
        assert_eq!(args, expected);
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

    #[test]
    pub fn cancelled_search_stops_the_child() {
        // a directory big enough to keep rg busy
        let tmp = std::env::temp_dir().join("quarry_cancel_test");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        for i in 0..2000 {
            fs::write(tmp.join(format!("f{i}.txt")), "needle\n".repeat(1000)).unwrap();
        }
        let root = tmp.to_str().unwrap().to_string();
        let handle = thread::spawn(move || {
            let _ = search(&root, "needle", 100000, false, false);
        });
        // give rg time to start
        thread::sleep(std::time::Duration::from_millis(200));
        cancel_active_search();
        let _ = handle.join();
        // active pid cleared
        assert_eq!(ACTIVE_RG.load(Ordering::SeqCst), 0);
        let _ = fs::remove_dir_all(&tmp);
    }
}
