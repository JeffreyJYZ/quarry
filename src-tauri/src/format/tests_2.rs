#![allow(unused_imports)]

pub use std::env;
pub use std::fs;
pub use std::io::Write;
pub use std::path::Path;
pub use std::process::{Command, Stdio};
pub use std::thread;

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_2 {
    use super::*;

    pub const SNIPPET: &str = "fn main(){println!(\"x\");}\n";

    #[test]
    pub fn stderr_detail_is_the_first_non_empty_line_truncated() {
        let stderr = "\n  error: expected one of `!`, `.`, `::`  \nnote: second line\n";
        assert_eq!(
            stderr_detail(stderr),
            "error: expected one of `!`, `.`, `::`"
        );

        assert_eq!(stderr_detail(""), "no stderr output");
        assert_eq!(stderr_detail("  \n\t\n"), "no stderr output");

        let long = "e".repeat(STDERR_LIMIT + 50);
        assert_eq!(stderr_detail(&long).chars().count(), STDERR_LIMIT);

        // Truncation counts characters, so a multi-byte line is never cut mid-character.
        let wide = "é".repeat(STDERR_LIMIT + 10);
        assert_eq!(stderr_detail(&wide).chars().count(), STDERR_LIMIT);
    }

    #[test]
    pub fn rustfmt_argv_is_edition_2021_to_stdout() {
        assert_eq!(
            argv(Formatter::Rustfmt, "/projects/demo/src/main.rs"),
            vec!["--edition", "2021", "--emit", "stdout"]
        );
    }

    #[test]
    pub fn clang_format_argv_assumes_the_document_path() {
        let args = argv(Formatter::ClangFormat, "/projects/demo/src/main.cpp");
        assert_eq!(args[0], "-assume-filename=/projects/demo/src/main.cpp");
        assert!(
            args[1].starts_with("-style="),
            "no style argument: {args:?}"
        );
        // A space in the path stays inside one argument: no shell ever splits it.
        let spaced = argv(Formatter::ClangFormat, "/projects/my demo/main.c");
        assert_eq!(spaced[0], "-assume-filename=/projects/my demo/main.c");
    }

    #[test]
    pub fn no_formatter_has_no_argv() {
        assert!(argv(Formatter::None, "/projects/demo/notes.txt").is_empty());
    }

    #[test]
    pub fn a_missing_formatter_names_the_tool_and_the_install_hint() {
        let rust = missing(RUSTFMT);
        assert!(rust.contains(RUSTFMT), "unexpected error: {rust}");
        assert!(
            rust.contains("rustup component add rustfmt"),
            "unexpected error: {rust}"
        );

        let clang = missing(CLANG_FORMAT);
        assert!(clang.contains(CLANG_FORMAT), "unexpected error: {clang}");
        assert!(
            clang.contains("xcode-select --install"),
            "unexpected error: {clang}"
        );
        assert!(
            clang.contains("brew install clang-format"),
            "unexpected error: {clang}"
        );
    }

    #[test]
    pub fn programs_are_named_for_each_formatter() {
        assert_eq!(program_for(Formatter::Rustfmt), RUSTFMT);
        assert_eq!(program_for(Formatter::ClangFormat), CLANG_FORMAT);
    }

    /// Opt-in: the real formatter only runs where it is installed.
    #[test]
    #[ignore = "requires rustfmt on PATH or through xcrun"]
    pub fn rustfmt_formats_a_snippet_from_stdin() {
        let root = env::temp_dir().to_string_lossy().into_owned();
        let formatted = run(Formatter::Rustfmt, &root, "/tmp/quarry-snippet.rs", SNIPPET)
            .expect("rustfmt should format the snippet");

        assert!(
            formatted.contains("fn main() {"),
            "unexpected output: {formatted}"
        );
        assert!(
            formatted.contains("println!(\"x\");"),
            "unexpected output: {formatted}"
        );
    }
}
