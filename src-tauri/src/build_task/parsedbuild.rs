#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
pub use serde_json::Value;
pub use std::collections::HashSet;
pub use std::path::Path;
pub use std::process::Command;
pub use std::time::Instant;

use super::*;

/// `CARGO` from the environment when set, else the shim on `PATH`.
pub fn cargo_program() -> String {
    std::env::var(CARGO_ENV)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_CARGO.to_string())
}
/// Parsed form of cargo's JSON stream: what the report needs, and nothing else.
pub struct ParsedBuild {
    pub(crate) diagnostics: Vec<Diagnostic>,
    /// Set by `build-finished`; `None` means the stream ended early and the exit status decides.
    pub(crate) success: Option<bool>,
    /// Compiler messages with no file to point at, kept for the fallback summary.
    pub(crate) unlocated: Vec<String>,
    /// Last executable a `compiler-artifact` message reported; `None` for libraries and build scripts.
    pub(crate) artifact: Option<String>,
}

/// One line of the stream.
pub enum ParsedLine {
    Diagnostics(Vec<Diagnostic>),
    /// A compiler message without a span carrying a file name: no diagnostic, but it names a failure.
    Unlocated(String),
    /// `build-finished`: the authoritative verdict.
    Finished(bool),
    /// `compiler-artifact` carrying an executable.
    Artifact(String),
    /// Non-JSON chatter, or a reason this slice does not use.
    Ignored,
}

pub fn parse_cargo_json(stdout: &str, build_root: &Path) -> ParsedBuild {
    let mut parsed = ParsedBuild {
        diagnostics: Vec::new(),
        success: None,
        unlocated: Vec::new(),
        artifact: None,
    };

    for line in stdout.lines() {
        match parse_message_line(line, build_root) {
            ParsedLine::Diagnostics(diagnostics) => parsed.diagnostics.extend(diagnostics),
            ParsedLine::Unlocated(text) => parsed.unlocated.push(text),
            ParsedLine::Finished(success) => parsed.success = Some(success),
            ParsedLine::Artifact(path) => parsed.artifact = Some(path),
            ParsedLine::Ignored => {}
        }
    }

    parsed
}

/// Parses a single line, tolerating the non-JSON lines cargo interleaves with the stream.
pub fn parse_message_line(line: &str, build_root: &Path) -> ParsedLine {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return ParsedLine::Ignored;
    };

    match value["reason"].as_str() {
        Some("compiler-message") => {
            let message = &value["message"];
            let diagnostics = diagnostics_for(message, build_root);
            if diagnostics.is_empty() {
                let text = message["message"].as_str().unwrap_or_default();
                return ParsedLine::Unlocated(text.to_string());
            }
            ParsedLine::Diagnostics(diagnostics)
        }
        Some("build-finished") => ParsedLine::Finished(value["success"].as_bool().unwrap_or(false)),
        Some("compiler-artifact") => match value["executable"].as_str() {
            Some(path) if !path.is_empty() => ParsedLine::Artifact(path.to_string()),
            _ => ParsedLine::Ignored,
        },
        _ => ParsedLine::Ignored,
    }
}

/// The diagnostic's own message, plus any error or warning child, all at the anchor span.
pub fn diagnostics_for(message: &Value, build_root: &Path) -> Vec<Diagnostic> {
    let Some(anchor) = anchor_span(message, build_root) else {
        return Vec::new();
    };

    let level = message["level"].as_str().unwrap_or_default();
    let text = message["message"].as_str().unwrap_or_default();
    let mut diagnostics = vec![diagnostic_at(&anchor, severity(level), text.to_string())];

    for child in message["children"].as_array().into_iter().flatten() {
        let child_level = child["level"].as_str().unwrap_or_default();
        if !matches!(child_level, "error" | "warning") {
            continue;
        }
        let child_text = child["message"].as_str().unwrap_or_default();
        diagnostics.push(diagnostic_at(
            &anchor,
            severity(child_level),
            format!("{child_level}: {child_text}"),
        ));
    }

    diagnostics
}

/// Where a message points: an absolute path and a zero-based, end-exclusive range.
pub struct Anchor {
    pub(crate) path: String,
    pub(crate) range: Range,
}

/// Prefers the primary span, falls back to the first span that names a file; `None` when none does.
pub fn anchor_span(message: &Value, build_root: &Path) -> Option<Anchor> {
    let spans = message["spans"].as_array()?;
    let located = |span: &&Value| {
        span["file_name"]
            .as_str()
            .is_some_and(|name| !name.is_empty())
    };
    let primary = |span: &&Value| span["is_primary"].as_bool() == Some(true);

    let span = spans
        .iter()
        .find(|span| primary(span) && located(span))
        .or_else(|| spans.iter().find(located))?;
    Some(Anchor {
        path: absolute_path(span, build_root),
        range: span_range(span),
    })
}

pub fn diagnostic_at(anchor: &Anchor, severity: u8, message: String) -> Diagnostic {
    Diagnostic {
        path: anchor.path.clone(),
        range: anchor.range,
        severity,
        message,
        source: Some(SOURCE.to_string()),
    }
}
