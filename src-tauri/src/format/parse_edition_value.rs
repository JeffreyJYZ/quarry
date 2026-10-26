#![allow(unused_imports)]

pub use std::env;
pub use std::fs;
pub use std::io::Write;
pub use std::path::Path;
pub use std::process::{Command, Stdio};
pub use std::thread;

use super::*;

pub fn parse_edition_value(raw: &str) -> Option<&str> {
    let raw = raw.trim();
    if let Some(rest) = raw.strip_prefix('"') {
        let end = rest.find('"')?;
        Some(&rest[..end])
    } else if let Some(rest) = raw.strip_prefix('\'') {
        let end = rest.find('\'')?;
        Some(&rest[..end])
    } else {
        let end = raw
            .find(|c: char| c.is_whitespace() || c == '#')
            .unwrap_or(raw.len());
        Some(&raw[..end])
    }
}

/// The exact argument list for a formatter. No shell is involved: each argument is passed separately.
pub fn argv(formatter: Formatter, path: &str) -> Vec<String> {
    match formatter {
        Formatter::Rustfmt => {
            let edition = rust_edition_for_path(path);
            vec![
                "--edition".to_string(),
                edition.to_string(),
                "--emit".to_string(),
                "stdout".to_string(),
            ]
        }
        Formatter::ClangFormat => vec![
            format!("-assume-filename={path}"),
            format!("-style={}", clang_style(path)),
        ],
        Formatter::Taplo => vec!["fmt".to_string(), "-".to_string()],
        Formatter::None => Vec::new(),
    }
}

/// Settings that make clang-format expand every brace pair onto its own lines.
///
/// LLVM's default style keeps a short function, block, `if` or loop body on one line, which the
/// editor's format command must never do: `int add(int x, int y) { return x + y; }` is one edit away
/// from a multi-line body, and a collapsed body hides breakpoints. Only the single-line allowances
/// are overridden, so the brace stays on the declaration line and a project's own `.clang-format`
/// keeps every other choice. A key the project already sets is left alone, so no duplicate key ever
/// reaches the YAML parser.
pub const CLANG_EXPANSION: [(&str, &str); 6] = [
    (
        "AllowShortBlocksOnASingleLine",
        "AllowShortBlocksOnASingleLine: Never",
    ),
    (
        "AllowShortFunctionsOnASingleLine",
        "AllowShortFunctionsOnASingleLine: None",
    ),
    (
        "AllowShortIfStatementsOnASingleLine",
        "AllowShortIfStatementsOnASingleLine: Never",
    ),
    (
        "AllowShortLoopsOnASingleLine",
        "AllowShortLoopsOnASingleLine: false",
    ),
    (
        "AllowShortLambdasOnASingleLine",
        "AllowShortLambdasOnASingleLine: None",
    ),
    (
        "AllowShortCaseLabelsOnASingleLine",
        "AllowShortCaseLabelsOnASingleLine: false",
    ),
];

/// The `-style` value for a document: the nearest `.clang-format`, or LLVM's defaults at 4/100, plus
/// the expansion keys the file does not set itself.
pub fn clang_style(path: &str) -> String {
    let mut lines: Vec<String> = match nearest_clang_format(path) {
        Some(text) => vec![text.trim_end().to_string()],
        None => vec![
            "BasedOnStyle: LLVM".to_string(),
            "IndentWidth: 4".to_string(),
            "ColumnLimit: 100".to_string(),
        ],
    };
    let project = lines.join("\n");
    for (key, setting) in CLANG_EXPANSION {
        if project.contains(key) {
            continue;
        }
        lines.push(setting.to_string());
    }
    lines.join("\n")
}
