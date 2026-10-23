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
pub mod tests_group_1 {
    use super::*;

    pub const ROOT: &str = "/projects/demo";

    pub fn root() -> &'static Path {
        Path::new(ROOT)
    }

    /// One line with a trailing newline, a submatch at byte 16 and line number 12.
    pub const MATCH: &str = r#"{"type":"match","data":{"path":{"text":"/projects/demo/src/main.rs"},"lines":{"text":"    let found = search_project(root);\n"},"line_number":12,"absolute_offset":0,"submatches":[{"match":{"text":"search_project"},"start":16,"end":30}]}}"#;

    #[test]
    pub fn match_record_uses_the_first_submatch_for_the_column() {
        let found = parse_match_line(MATCH, root()).expect("a match record");

        assert_eq!(found.path, "/projects/demo/src/main.rs");
        assert_eq!(found.line, 12);
        assert_eq!(found.column, 17);
        assert_eq!(found.text, "    let found = search_project(root);");
    }

    #[test]
    pub fn non_match_records_are_skipped() {
        let summary = r#"{"type":"summary","data":{"elapsed_total":{"secs":0,"nanos":1234,"human":"0.000001s"},"stats":{"bytes_printed":0,"matched_lines":0,"matches":0}}}"#;
        let begin = r#"{"type":"begin","data":{"path":{"text":"/projects/demo/src/main.rs"}}}"#;
        let end = r#"{"type":"end","data":{"path":{"text":"/projects/demo/src/main.rs"},"binary_offset":null,"stats":{}}}"#;

        assert!(parse_match_line(summary, root()).is_none());
        assert!(parse_match_line(begin, root()).is_none());
        assert!(parse_match_line(end, root()).is_none());

        let (matches, truncated) =
            collect_matches([begin, MATCH, summary, end].into_iter(), root(), 10);
        assert_eq!(matches.len(), 1);
        assert!(!truncated);
    }

    #[test]
    pub fn line_text_loses_its_trailing_newline() {
        let lf = parse_match_line(MATCH, root()).expect("a match record");
        assert!(!lf.text.ends_with('\n'));

        let crlf = MATCH.replace("\\n", "\\r\\n");
        let found = parse_match_line(&crlf, root()).expect("a match record");
        assert_eq!(found.text, "    let found = search_project(root);");
    }

    #[test]
    pub fn cap_stops_collection_and_reports_truncation() {
        let second = MATCH.replace("line_number\":12", "line_number\":13");
        let third = MATCH.replace("line_number\":12", "line_number\":14");
        let lines = [MATCH, second.as_str(), third.as_str()];

        let (matches, truncated) = collect_matches(lines.into_iter(), root(), 2);
        assert_eq!(matches.len(), 2);
        assert!(truncated);

        let (all, uncapped) = collect_matches(lines.into_iter(), root(), 10);
        assert_eq!(all.len(), 3);
        assert!(!uncapped);

        let exactly = collect_matches(lines[..2].iter().copied(), root(), 2);
        assert_eq!(exactly.0.len(), 2);
        assert!(exactly.1);
    }

    #[test]
    pub fn malformed_lines_are_skipped_without_panicking() {
        let truncated_json = r#"{"type":"match","data":{"path":"#;
        let not_json = "src/main.rs:12:search_project";

        assert!(parse_match_line(truncated_json, root()).is_none());
        assert!(parse_match_line(not_json, root()).is_none());
        assert!(parse_match_line("", root()).is_none());

        let (matches, _) =
            collect_matches([truncated_json, MATCH, not_json].into_iter(), root(), 10);
        assert_eq!(matches.len(), 1);
    }

    #[test]
    pub fn relative_paths_are_joined_to_the_root() {
        let relative = MATCH.replace("/projects/demo/src/main.rs", "src/main.rs");
        let found = parse_match_line(&relative, root()).expect("a match record");

        assert_eq!(found.path, "/projects/demo/src/main.rs");
    }

    #[test]
    pub fn matches_sort_by_path_then_line() {
        let later = MATCH.replace("line_number\":12", "line_number\":20");
        let other = MATCH.replace("/projects/demo/src/main.rs", "/projects/demo/src/lib.rs");
        let mut matches = vec![
            parse_match_line(&later, root()).expect("a match record"),
            parse_match_line(&other, root()).expect("a match record"),
            parse_match_line(MATCH, root()).expect("a match record"),
        ];

        sort_matches(&mut matches);

        let order: Vec<(&str, u32)> = matches
            .iter()
            .map(|found| (found.path.as_str(), found.line))
            .collect();
        assert_eq!(
            order,
            vec![
                ("/projects/demo/src/lib.rs", 12),
                ("/projects/demo/src/main.rs", 12),
                ("/projects/demo/src/main.rs", 20),
            ]
        );
    }

    #[test]
    pub fn replace_writes_files_and_counts() {
        let dir = std::env::temp_dir().join("quarry_replace_test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a.txt"), "foo bar\nfoo baz\n").unwrap();
        let report = replace(dir.to_str().unwrap(), "foo", "qux", false, true).unwrap();
        assert_eq!(report.files_changed, 1);
        assert_eq!(report.replacements, 2);
        assert!(
            fs::read_to_string(dir.join("a.txt"))
                .unwrap()
                .contains("qux bar")
        );
        let _ = fs::remove_dir_all(&dir);
    }
}
