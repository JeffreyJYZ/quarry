#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{ProjectKind, TestItem, TestReport};
pub use std::io::{BufRead, BufReader, Read};
pub use std::process::{ExitStatus, Stdio};
pub use std::sync::{Arc, Mutex};
pub use std::thread;
pub use std::time::{Duration, Instant};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_1 {
    use super::*;

    /// Cargo chatter, a test listed before any header, a duplicated name, a bench line and an inner
    /// `::` both appear; the header re-points the binary for the names after it.
    pub const LIST_FIXTURE: &str = concat!(
        "    Finished `test` profile [unoptimized + debuginfo] target(s) in 1.02s\n",
        "prelude::tests::before_any_header: test\n",
        "     Running unittests src/lib.rs (target/debug/deps/quarry_lib-abc123)\n",
        "protocol_pipe::tests::roundtrip: test\n",
        "protocol_pipe::benches::throughput: bench\n",
        "protocol_pipe::tests::roundtrip: test\n",
        "build_task::tests::inner::helper: test\n",
        "suffix::tests::not_a_test: test extra\n",
        "not a test line at all\n",
    );

    #[test]
    pub fn parse_tests_reads_test_lines_and_attributes_the_header() {
        let items = parse_tests(LIST_FIXTURE, "quarry");

        let names: Vec<&str> = items.iter().map(|item| item.name.as_str()).collect();
        assert_eq!(
            names,
            [
                "prelude::tests::before_any_header",
                "protocol_pipe::tests::roundtrip",
                "build_task::tests::inner::helper",
            ],
            "bench, duplicates and non-test lines must not appear"
        );

        assert_eq!(items[0].binary, "quarry");
        assert_eq!(items[1].binary, "src/lib.rs");
        assert_eq!(items[2].binary, "src/lib.rs");
    }

    #[test]
    pub fn parse_tests_without_a_header_uses_the_crate_name() {
        let merged = concat!(
            "alpha::tests::one: test\n",
            "alpha::benches::hot: bench\n",
            "beta::tests::two: test\n",
        );

        let items = parse_tests(merged, "demo");

        assert_eq!(items.len(), 2);
        assert!(items.iter().all(|item| item.binary == "demo"));
        assert_eq!(items[1].name, "beta::tests::two");
    }

    #[test]
    pub fn parse_tests_of_empty_output_is_empty() {
        assert!(parse_tests("", "demo").is_empty());
        assert!(parse_tests("only::benches::here: bench\n", "demo").is_empty());
    }

    #[test]
    pub fn tail_output_keeps_the_last_two_hundred_lines() {
        let lines: Vec<String> = (0..250).map(|index| format!("line {index}")).collect();

        let output = tail_output(&lines);
        let kept: Vec<&str> = output.lines().collect();

        assert_eq!(kept.len(), OUTPUT_LINE_LIMIT);
        assert_eq!(kept.first(), Some(&"line 50"));
        assert_eq!(kept.last(), Some(&"line 249"));
    }

    #[test]
    pub fn tail_output_drops_repeated_download_noise_only() {
        let lines: Vec<String> = [
            "   Downloading crates ...",
            "   Downloading crates ...",
            "    Compiling quarry v0.1.0",
            "  Downloaded serde v1.0.0",
            "  Downloaded serde v1.0.0",
            "kept",
            "kept",
        ]
        .iter()
        .map(|line| (*line).to_string())
        .collect();

        assert_eq!(
            tail_output(&lines),
            "   Downloading crates ...\n    Compiling quarry v0.1.0\n  Downloaded serde v1.0.0\nkept\nkept"
        );
    }

    #[test]
    pub fn timeout_error_names_the_operation_and_the_limit() {
        let discovery = timeout_error("list tests", LIST_TIMEOUT);
        assert!(discovery.contains("list tests"), "unexpected: {discovery}");
        assert!(discovery.contains("timed out"), "unexpected: {discovery}");
        assert!(discovery.contains("120 s"), "unexpected: {discovery}");

        let run = timeout_error("run a test", RUN_TIMEOUT);
        assert!(run.contains("300 s"), "unexpected: {run}");
    }

    #[test]
    pub fn failure_error_uses_the_first_stderr_line_truncated() {
        let lines = vec![
            Line {
                text: "    Finished `test` profile".to_string(),
                stderr: true,
            },
            Line {
                text: "error: could not compile `quarry`".to_string(),
                stderr: true,
            },
        ];
        assert_eq!(
            failure_error("list tests", "/projects/demo", &lines),
            "cannot list tests in /projects/demo: Finished `test` profile"
        );

        let long = vec![Line {
            text: "e".repeat(ERROR_LINE_LIMIT + 100),
            stderr: true,
        }];
        let error = failure_error("run a test", "/projects/demo", &long);
        assert_eq!(
            error,
            format!(
                "cannot run a test in /projects/demo: {}",
                "e".repeat(ERROR_LINE_LIMIT)
            )
        );
    }
}
