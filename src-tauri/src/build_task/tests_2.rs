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
    pub fn a_child_keeps_its_own_span_and_a_note_is_kept() {
        let line = r#"{"reason":"compiler-message","message":{"level":"error","message":"mismatched types","spans":[{"file_name":"src/main.rs","line_start":5,"line_end":5,"column_start":2,"column_end":4,"is_primary":true}],"children":[{"level":"note","message":"expected `u32`, found `&str`","spans":[{"file_name":"src/lib.rs","line_start":9,"line_end":9,"column_start":3,"column_end":8,"is_primary":false}]},{"level":"help","message":"consider borrowing","spans":[]},{"level":"warning","message":"unused import","spans":[{"file_name":"src/lib.rs","line_start":2,"line_end":2,"column_start":1,"column_end":4,"is_primary":true}]}]}}"#;

        let ParsedLine::Diagnostics(diagnostics) = parse_message_line(line, build_root()) else {
            panic!("expected diagnostics");
        };

        assert_eq!(diagnostics.len(), 4);
        assert_eq!(diagnostics[0].message, "mismatched types");
        // The note points at another file and line, and it is no longer discarded for its level.
        assert_eq!(diagnostics[1].path, format!("{BUILD_ROOT}/src/lib.rs"));
        assert_eq!(diagnostics[1].range.start.line, 8);
        assert_eq!(diagnostics[1].severity, 3);
        assert_eq!(diagnostics[1].message, "note: expected `u32`, found `&str`");
        // A child without a span of its own falls back to the parent's site, not to nothing.
        assert_eq!(diagnostics[2].path, diagnostics[0].path);
        assert_eq!(diagnostics[2].range, diagnostics[0].range);
        assert_eq!(diagnostics[2].severity, 4);
        // A warning that points elsewhere keeps that site too.
        assert_eq!(diagnostics[3].path, format!("{BUILD_ROOT}/src/lib.rs"));
        assert_eq!(diagnostics[3].range.start.line, 1);
        assert_eq!(diagnostics[3].severity, 2);
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
            summarize(stderr, &[], true),
            "Finished `dev` profile [unoptimized]"
        );

        assert_eq!(summarize("  \n\n", &[], true), DEFAULT_SUMMARY);
        assert_eq!(
            summarize("", &["could not compile `demo`".to_string()], false),
            "could not compile `demo`"
        );

        let long = "e".repeat(SUMMARY_LIMIT + 50);
        assert_eq!(summarize(&long, &[], true).chars().count(), SUMMARY_LIMIT);
    }

    #[test]
    pub fn a_failed_build_with_empty_output_never_reports_success() {
        let summary = summarize("  \n\n", &[], false);

        assert_eq!(summary, FAILED_SUMMARY);
        assert!(
            !summary.contains("succeeded"),
            "a failed build reported success: {summary}"
        );
        assert_eq!(summarize("", &[], true), DEFAULT_SUMMARY);
    }

    #[test]
    pub fn profile_accepts_clions_four_and_cargo_sees_two() {
        assert!(!BuildProfile::Debug.cargo_release());
        assert!(BuildProfile::Release.cargo_release());
        assert!(BuildProfile::RelWithDebInfo.cargo_release());
        assert!(BuildProfile::MinSizeRel.cargo_release());

        let error = BuildProfile::from_wire("bench").expect_err("bench is not a profile");
        assert!(error.contains("\"debug\""), "unexpected error: {error}");
        assert!(error.contains("\"release\""), "unexpected error: {error}");
        assert!(
            error.contains("\"relwithdebinfo\""),
            "unexpected error: {error}"
        );
    }

    #[test]
    pub fn only_cargo_is_wired() {
        assert!(require_cargo(ProjectKind::Cargo).is_ok());

        for kind in [ProjectKind::Cmake, ProjectKind::CompileCommands] {
            let error = require_cargo(kind).expect_err("cargo does not build C/C++ projects");
            assert!(error.contains("C/C++ project"), "unexpected error: {error}");
            assert!(
                error.contains("Cargo projects only"),
                "unexpected error: {error}"
            );
            // The C/C++ branches are shipped, so the gate must not claim the feature is missing.
            assert!(
                !error.contains("not wired"),
                "the mis-dispatch message claims a shipped feature is missing: {error}"
            );
        }
        assert!(require_cargo(ProjectKind::Unknown).is_err());
    }
}
