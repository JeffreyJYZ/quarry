#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
pub use serde_json::Value;
pub use std::collections::HashSet;
pub use std::path::Path;
pub use std::process::Command;
pub use std::time::Instant;

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_3 {
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

    /// A compiler error line becomes one diagnostic with a zero-based, one-character range.
    #[test]
    pub fn text_error_line_becomes_a_diagnostic() {
        let text = "src/main.cpp:12:5: error: expected ';'";

        let diagnostics = parse_text_diagnostics(text, build_root());

        assert_eq!(diagnostics.len(), 1);
        let diagnostic = &diagnostics[0];
        assert_eq!(diagnostic.path, format!("{BUILD_ROOT}/src/main.cpp"));
        assert_eq!(
            diagnostic.range,
            Range {
                start: Position {
                    line: 11,
                    character: 4
                },
                end: Position {
                    line: 11,
                    character: 5
                },
            }
        );
        assert_eq!(diagnostic.severity, 1);
        assert_eq!(diagnostic.message, "expected ';'");
        assert_eq!(diagnostic.source.as_deref(), Some("cmake"));
    }

    #[test]
    pub fn text_warning_line_becomes_a_warning_diagnostic() {
        let text = "src/main.cpp:3:9: warning: unused variable 'x'";

        let diagnostics = parse_text_diagnostics(text, build_root());

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].severity, 2);
        assert_eq!(diagnostics[0].message, "unused variable 'x'");
        assert_eq!(diagnostics[0].range.start.line, 2);
        assert_eq!(diagnostics[0].range.start.character, 8);
    }

    #[test]
    pub fn text_note_and_remark_lines_become_information_diagnostics() {
        let text = concat!(
            "src/main.cpp:7:3: note: declared here\n",
            "src/main.cpp:8:3: remark: see the manual\n",
        );

        let diagnostics = parse_text_diagnostics(text, build_root());

        assert_eq!(diagnostics.len(), 2);
        assert_eq!(diagnostics[0].severity, 3);
        assert_eq!(diagnostics[0].message, "declared here");
        assert_eq!(diagnostics[1].severity, 3);
        assert_eq!(diagnostics[1].message, "see the manual");
    }

    /// Include headers and continuation lines carry no severity, so they are not diagnostics.
    #[test]
    pub fn include_and_continuation_lines_are_ignored() {
        let text = concat!(
            "In file included from src/main.cpp:1:\n",
            "                 from include/thing.h:3:\n",
            "include/thing.h:5:1: warning: unused include\n",
        );

        let diagnostics = parse_text_diagnostics(text, build_root());

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].path, format!("{BUILD_ROOT}/include/thing.h"));
        assert_eq!(diagnostics[0].severity, 2);
    }

    #[test]
    pub fn relative_text_paths_are_joined_to_the_build_root() {
        let text = "src/deep/nested/file.cpp:1:1: error: boom";

        let diagnostics = parse_text_diagnostics(text, build_root());

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(
            diagnostics[0].path,
            format!("{BUILD_ROOT}/src/deep/nested/file.cpp")
        );
    }

    #[test]
    pub fn absolute_text_paths_are_kept() {
        let text = "/elsewhere/file.cpp:1:1: error: boom";

        let diagnostics = parse_text_diagnostics(text, build_root());

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].path, "/elsewhere/file.cpp");
    }

    #[test]
    pub fn identical_text_diagnostics_are_deduplicated() {
        let text = concat!(
            "src/main.cpp:12:5: error: expected ';'\n",
            "src/main.cpp:12:5: error: expected ';'\n",
            "src/main.cpp:13:5: error: expected ';'\n",
        );

        let diagnostics = parse_text_diagnostics(text, build_root());

        assert_eq!(diagnostics.len(), 2);
        assert_eq!(diagnostics[0].range.start.line, 11);
        assert_eq!(diagnostics[1].range.start.line, 12);
    }
}
