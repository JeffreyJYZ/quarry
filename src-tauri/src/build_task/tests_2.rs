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
pub mod tests_group_2 {
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

    #[test]
    pub fn an_artifact_without_executable_is_skipped() {
        let line = r#"{"reason":"compiler-artifact","target":{"name":"demo"},"executable":null,"filenames":[]}"#;

        assert!(matches!(
            parse_message_line(line, build_root()),
            ParsedLine::Ignored
        ));
        assert_eq!(parse_cargo_json(line, build_root()).artifact, None);
    }

    #[test]
    pub fn non_json_lines_are_skipped_without_panicking() {
        let line = "    Compiling demo v0.1.0 (/projects/demo)";
        assert!(matches!(
            parse_message_line(line, build_root()),
            ParsedLine::Ignored
        ));

        let mixed = concat!(
            "    Compiling demo v0.1.0 (/projects/demo)\n",
            r#"{"reason":"compiler-artifact","target":{"name":"demo"},"filenames":[]}"#,
            "\n",
            r#"{"reason":"build-finished","success":true}"#,
            "\n",
        );
        let parsed = parse_cargo_json(mixed, build_root());
        assert!(parsed.diagnostics.is_empty());
        assert_eq!(parsed.success, Some(true));
    }

    #[test]
    pub fn error_and_warning_children_become_extra_diagnostics_at_the_primary_span() {
        let line = r#"{"reason":"compiler-message","message":{"level":"error","message":"mismatched types","spans":[{"file_name":"src/main.rs","line_start":5,"line_end":5,"column_start":2,"column_end":4,"is_primary":true}],"children":[{"level":"error","message":"expected `u32`, found `&str`","spans":[]},{"level":"warning","message":"consider borrowing","spans":[]},{"level":"note","message":"ignored note","spans":[]}]}}"#;

        let ParsedLine::Diagnostics(diagnostics) = parse_message_line(line, build_root()) else {
            panic!("expected diagnostics");
        };

        assert_eq!(diagnostics.len(), 3);
        assert_eq!(diagnostics[0].severity, 1);
        assert_eq!(
            diagnostics[1].message,
            "error: expected `u32`, found `&str`"
        );
        assert_eq!(diagnostics[1].severity, 1);
        assert_eq!(diagnostics[2].message, "warning: consider borrowing");
        assert_eq!(diagnostics[2].severity, 2);
        for diagnostic in &diagnostics {
            assert_eq!(diagnostic.range, diagnostics[0].range);
            assert_eq!(diagnostic.path, diagnostics[0].path);
        }
    }

    #[test]
    pub fn level_mapping_follows_the_lsp_scale() {
        assert_eq!(severity("error"), 1);
        assert_eq!(severity("error: internal compiler error"), 1);
        assert_eq!(severity("warning"), 2);
        assert_eq!(severity("note"), 3);
        assert_eq!(severity("help"), 4);
        assert_eq!(severity("failure-note"), 4);
    }

    #[test]
    pub fn summary_is_the_last_non_empty_stderr_line_truncated() {
        let stderr = "warning: unused\n\n    Finished `dev` profile [unoptimized]\n\n";
        assert_eq!(
            summarize(stderr, &[]),
            "Finished `dev` profile [unoptimized]"
        );

        assert_eq!(summarize("  \n\n", &[]), DEFAULT_SUMMARY);
        assert_eq!(
            summarize("", &["could not compile `demo`".to_string()]),
            "could not compile `demo`"
        );

        let long = "e".repeat(SUMMARY_LIMIT + 50);
        assert_eq!(summarize(&long, &[]).chars().count(), SUMMARY_LIMIT);
    }

    #[test]
    pub fn profile_accepts_only_debug_and_release() {
        assert_eq!(release_for("debug"), Ok(false));
        assert_eq!(release_for("release"), Ok(true));

        let error = release_for("bench").expect_err("bench is not a profile");
        assert!(error.contains("\"debug\""), "unexpected error: {error}");
        assert!(error.contains("\"release\""), "unexpected error: {error}");
    }

    #[test]
    pub fn only_cargo_is_wired() {
        assert!(require_cargo(ProjectKind::Cargo).is_ok());

        for kind in [ProjectKind::Cmake, ProjectKind::CompileCommands] {
            let error = require_cargo(kind).expect_err("C/C++ is not wired");
            assert!(
                error.contains("C/C++ builds are not wired yet"),
                "unexpected error: {error}"
            );
        }
        assert!(require_cargo(ProjectKind::Unknown).is_err());
    }
}
