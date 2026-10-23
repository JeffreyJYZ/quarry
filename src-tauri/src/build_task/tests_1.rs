#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
pub use serde_json::Value;
pub use std::collections::HashSet;
pub use std::path::Path;
pub use std::process::Command;
pub use std::time::Instant;

use super::*;

/// Last non-empty line of the build output, truncated for the status bar.
pub fn summarize_text(text: &str) -> String {
    let last = text
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .map(|line| line.trim());
    truncate(last.unwrap_or(DEFAULT_CPP_SUMMARY), SUMMARY_LIMIT)
}
#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_1 {
    use super::*;

    pub const BUILD_ROOT: &str = "/projects/demo";

    pub fn build_root() -> &'static Path {
        Path::new(BUILD_ROOT)
    }

    pub fn only_diagnostic(line: &str) -> Diagnostic {
        match parse_message_line(line, build_root()) {
            ParsedLine::Diagnostics(mut diagnostics) => {
                assert_eq!(diagnostics.len(), 1, "expected exactly one diagnostic");
                diagnostics.remove(0)
            }
            _ => panic!("expected a diagnostic line"),
        }
    }

    /// Warning with a primary span at line 7, column 5: zero-based line 6, character 4.
    #[test]
    pub fn warning_with_primary_span_converts_to_zero_based() {
        let line = r#"{"reason":"compiler-message","message":{"level":"warning","message":"unused variable: `x`","spans":[{"file_name":"src/main.rs","line_start":7,"line_end":7,"column_start":5,"column_end":10,"is_primary":true}],"children":[]}}"#;

        let diagnostic = only_diagnostic(line);

        assert_eq!(diagnostic.path, format!("{BUILD_ROOT}/src/main.rs"));
        assert_eq!(
            diagnostic.range,
            Range {
                start: Position {
                    line: 6,
                    character: 4
                },
                end: Position {
                    line: 6,
                    character: 9
                },
            }
        );
        assert_eq!(diagnostic.severity, 2);
        assert_eq!(diagnostic.message, "unused variable: `x`");
        assert_eq!(diagnostic.source.as_deref(), Some("cargo"));
    }

    #[test]
    pub fn error_falls_back_to_the_first_span_when_none_is_primary() {
        let line = r#"{"reason":"compiler-message","message":{"level":"error","message":"mismatched types","spans":[{"file_name":"src/lib.rs","line_start":3,"line_end":4,"column_start":1,"column_end":2,"is_primary":false}],"children":[]}}"#;

        let diagnostic = only_diagnostic(line);

        assert_eq!(diagnostic.severity, 1);
        assert_eq!(diagnostic.path, format!("{BUILD_ROOT}/src/lib.rs"));
        assert_eq!(
            diagnostic.range,
            Range {
                start: Position {
                    line: 2,
                    character: 0
                },
                end: Position {
                    line: 3,
                    character: 1
                },
            }
        );
    }

    #[test]
    pub fn message_without_spans_yields_no_diagnostic() {
        let line = r#"{"reason":"compiler-message","message":{"level":"error","message":"could not compile `demo`","spans":[]}}"#;

        match parse_message_line(line, build_root()) {
            ParsedLine::Unlocated(text) => assert_eq!(text, "could not compile `demo`"),
            _ => panic!("expected the message to be unlocated"),
        }
        assert!(parse_cargo_json(line, build_root()).diagnostics.is_empty());
    }

    #[test]
    pub fn span_without_a_file_name_is_not_a_diagnostic() {
        let line = r#"{"reason":"compiler-message","message":{"level":"warning","message":"something","spans":[{"line_start":1,"line_end":1,"column_start":1,"column_end":2,"is_primary":true}]}}"#;

        assert!(parse_cargo_json(line, build_root()).diagnostics.is_empty());
    }

    #[test]
    pub fn absolute_span_paths_are_kept_and_relative_ones_joined() {
        let absolute = r#"{"reason":"compiler-message","message":{"level":"note","message":"note","spans":[{"file_name":"/elsewhere/mod.rs","line_start":1,"line_end":1,"column_start":2,"column_end":3,"is_primary":true}]}}"#;
        assert_eq!(only_diagnostic(absolute).path, "/elsewhere/mod.rs");

        let nested = r#"{"reason":"compiler-message","message":{"level":"note","message":"note","spans":[{"file_name":"crates/core/src/main.rs","line_start":1,"line_end":1,"column_start":2,"column_end":3,"is_primary":true}]}}"#;
        assert_eq!(
            only_diagnostic(nested).path,
            format!("{BUILD_ROOT}/crates/core/src/main.rs")
        );
    }

    #[test]
    pub fn build_finished_carries_the_verdict() {
        let finished = r#"{"reason":"build-finished","success":false}"#;

        assert!(matches!(
            parse_message_line(finished, build_root()),
            ParsedLine::Finished(false)
        ));
        assert_eq!(
            parse_cargo_json(finished, build_root()).success,
            Some(false)
        );
    }

    #[test]
    pub fn an_executable_artifact_is_reported() {
        let line = r#"{"reason":"compiler-artifact","target":{"name":"demo","kind":["bin"]},"executable":"/projects/demo/target/release/demo"}"#;

        assert!(matches!(
            parse_message_line(line, build_root()),
            ParsedLine::Artifact(_)
        ));

        let stream = format!(
            "{line}\n{}",
            r#"{"reason":"build-finished","success":true}"#
        );
        assert_eq!(
            parse_cargo_json(&stream, build_root()).artifact.as_deref(),
            Some("/projects/demo/target/release/demo")
        );
    }
}
