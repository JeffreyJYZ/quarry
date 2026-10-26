#![allow(unused_imports)]

pub use std::env;
pub use std::fs;
pub use std::io::Write;
pub use std::path::Path;
pub use std::process::{Command, Stdio};
pub use std::thread;

use super::*;

/// Ask `xcrun` for the tool's path; a missing `xcrun`, a non-zero status or a stale path is "not found".
pub fn find_with_xcrun(name: &str) -> Option<String> {
    let output = Command::new("xcrun").args(["--find", name]).output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let found = stdout.lines().next()?.trim();
    if found.is_empty() || !Path::new(found).exists() {
        return None;
    }

    Some(found.to_string())
}
#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_1 {
    use super::*;

    pub const SNIPPET: &str = "fn main(){println!(\"x\");}\n";

    #[test]
    pub fn clang_style_forbids_every_single_line_body() {
        let style = clang_style("/projects/demo/src/main.cpp");
        for (key, _) in CLANG_EXPANSION {
            assert!(style.contains(key), "missing {key} in:\n{style}");
        }
        assert!(
            style.contains("BasedOnStyle: LLVM"),
            "no base style:\n{style}"
        );
        assert_eq!(
            style.matches("AllowShortFunctionsOnASingleLine").count(),
            1,
            "a key is written twice:\n{style}"
        );
    }

    #[test]
    pub fn a_project_clang_format_keeps_its_own_answer() {
        let dir = std::env::temp_dir().join(format!("quarry-clang-style-{}", std::process::id()));
        let src = dir.join("src");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&src).expect("creates the fixture");
        std::fs::write(
            dir.join(".clang-format"),
            "BasedOnStyle: Google\nAllowShortFunctionsOnASingleLine: Inline\n",
        )
        .expect("writes the project style");

        let style = clang_style(src.join("main.cpp").to_str().expect("utf-8 path"));
        assert_eq!(
            style.matches("AllowShortFunctionsOnASingleLine").count(),
            1,
            "the project key was duplicated:\n{style}"
        );
        assert!(
            style.contains("AllowShortFunctionsOnASingleLine: Inline"),
            "the project value was dropped:\n{style}"
        );
        assert!(
            style.contains("AllowShortBlocksOnASingleLine: Never"),
            "a key the project did not set was not added:\n{style}"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    pub fn clang_argv_carries_the_style() {
        let args = argv(Formatter::ClangFormat, "/projects/demo/main.cpp");
        assert!(args.iter().any(|arg| arg.starts_with("-style=")));
        assert!(
            args.iter()
                .any(|arg| arg == "-assume-filename=/projects/demo/main.cpp")
        );
    }

    #[test]
    pub fn rust_extension_maps_to_rustfmt() {
        assert_eq!(
            formatter_for_path("/projects/demo/src/main.rs"),
            Formatter::Rustfmt
        );
        assert_eq!(formatter_for_path("lib.rs"), Formatter::Rustfmt);
        // Extensions are matched case-insensitively.
        assert_eq!(formatter_for_path("MAIN.RS"), Formatter::Rustfmt);
    }

    #[test]
    pub fn every_c_family_extension_maps_to_clang_format() {
        for path in [
            "main.c", "main.h", "main.cc", "main.cpp", "main.cxx", "main.hh", "main.hpp",
            "MAIN.CPP",
        ] {
            assert_eq!(
                formatter_for_path(path),
                Formatter::ClangFormat,
                "unexpected formatter for {path}"
            );
        }
    }

    #[test]
    pub fn unknown_or_missing_extensions_have_no_formatter() {
        for path in [
            "notes.txt",
            "README.md",
            "main",
            "/projects/demo/Makefile",
            "main.c.orig",
            "main.rs.bak",
        ] {
            assert_eq!(
                formatter_for_path(path),
                Formatter::None,
                "unexpected formatter for {path}"
            );
        }
    }

    #[test]
    pub fn oversized_input_is_rejected_by_name() {
        assert!(require_size(0).is_ok());
        assert!(require_size(MAX_INPUT_BYTES).is_ok());

        let error = require_size(MAX_INPUT_BYTES + 1).expect_err("over the limit");
        assert!(
            error.contains(&MAX_INPUT_BYTES.to_string()),
            "unexpected error: {error}"
        );
        assert!(error.contains("4 MiB"), "unexpected error: {error}");

        // The rejection scales with the input, so the message names the document's own size too.
        let big = MAX_INPUT_BYTES * 2;
        let error = require_size(big).expect_err("far over the limit");
        assert!(
            error.contains(&big.to_string()),
            "unexpected error: {error}"
        );
    }
}
