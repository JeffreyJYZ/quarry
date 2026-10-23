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
pub mod tests_group_4 {
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
    pub fn malformed_text_lines_are_skipped() {
        let text = concat!(
            "this is not a diagnostic\n",
            "src/main.cpp:12:5: error: real error\n",
            "no colon at all\n",
        );

        let diagnostics = parse_text_diagnostics(text, build_root());

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].message, "real error");
    }

    #[test]
    pub fn cmake_argv_carries_the_profile_and_the_configure_step() {
        let configure = cmake_configure_argv("/projects/demo", "/projects/demo/build");
        assert_eq!(
            configure.iter().map(String::as_str).collect::<Vec<_>>(),
            vec![
                "cmake",
                "-S",
                "/projects/demo",
                "-B",
                "/projects/demo/build",
                "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
            ]
        );

        let debug = cmake_build_argv("/projects/demo/build", false);
        assert_eq!(
            debug.iter().map(String::as_str).collect::<Vec<_>>(),
            vec![
                "cmake",
                "--build",
                "/projects/demo/build",
                "--config",
                "Debug"
            ]
        );

        let release = cmake_build_argv("/projects/demo/build", true);
        assert_eq!(
            release.iter().map(String::as_str).collect::<Vec<_>>(),
            vec![
                "cmake",
                "--build",
                "/projects/demo/build",
                "--config",
                "Release"
            ]
        );
    }

    #[test]
    pub fn missing_cmake_names_the_tool_and_says_it_must_be_installed() {
        let error = missing_cmake_error();

        assert!(error.contains("cmake"), "unexpected error: {error}");
        assert!(
            error.contains("CMake installed"),
            "unexpected error: {error}"
        );
    }

    #[test]
    pub fn compile_commands_projects_point_at_the_launch_config() {
        let error = compile_commands_not_wired();

        assert!(
            error.contains("compile_commands.json"),
            "unexpected error: {error}"
        );
        assert!(
            error.contains(".quarry/launch.json"),
            "unexpected error: {error}"
        );
    }

    #[test]
    pub fn text_summary_is_the_last_non_empty_line_truncated() {
        assert_eq!(
            summarize_text("compiling\n[100%] built target demo\n\n"),
            "[100%] built target demo"
        );
        assert_eq!(summarize_text("  \n\n"), DEFAULT_CPP_SUMMARY);

        let long = "e".repeat(SUMMARY_LIMIT + 50);
        assert_eq!(summarize_text(&long).chars().count(), SUMMARY_LIMIT);
    }
}
