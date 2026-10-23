#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{BuildReport, Diagnostic, Position, ProjectKind, Range};
pub use serde_json::Value;
pub use std::collections::HashSet;
pub use std::path::Path;
pub use std::process::Command;
pub use std::time::Instant;

use super::*;

/// One compiler line: `path:line:column: severity: message`.
pub fn parse_text_diagnostic(line: &str, build_root: &Path) -> Option<Diagnostic> {
    let (head, message, severity) = split_severity(line)?;
    let message = message.trim();
    if message.is_empty() {
        return None;
    }

    let (path, line_number, column) = split_position(head)?;
    let start = Position {
        line: offset(u64::from(line_number)),
        character: offset(u64::from(column)),
    };

    Some(Diagnostic {
        path: absolute_text_path(&path, build_root),
        range: Range {
            start,
            end: Position {
                line: start.line,
                character: start.character.saturating_add(1),
            },
        },
        severity,
        message: message.to_string(),
        source: Some(CMAKE_SOURCE.to_string()),
    })
}
/// Splits a line into its position head and the `severity: message` tail.
///
/// The earliest severity marker wins, so a message that mentions `error:` further right does not
/// move the split. A line without a marker carries no severity and is skipped: that covers
/// clang's `In file included from` headers and its bare `path:line:` continuation lines.
pub fn split_severity(line: &str) -> Option<(&str, &str, u8)> {
    let mut found: Option<(usize, u8)> = None;
    for (marker, severity) in TEXT_SEVERITIES {
        if let Some(index) = line.find(marker)
            && found.is_none_or(|(at, _)| index < at)
        {
            found = Some((index, severity));
        }
    }

    let (index, severity) = found?;
    let head = &line[..index];
    let tail = line[index + 1..].trim_start();
    let (_, message) = tail.split_once(':')?;
    Some((head, message, severity))
}

/// Splits `path:line:column` into its parts; the column is optional and defaults to 1.
pub fn split_position(head: &str) -> Option<(String, u32, u32)> {
    let head = head.trim();
    let (rest, last) = head.rsplit_once(':')?;
    let last_number = last.trim().parse::<u32>().ok();

    let (path, line, column) = match (last_number, rest.rsplit_once(':')) {
        (Some(column), Some((path, line))) => (path, line, column),
        (Some(_), None) => (rest, last, 1),
        (None, Some((path, line))) => (path, line, 1),
        (None, None) => return None,
    };

    let line = line.trim().parse::<u32>().ok()?;
    let path = path.trim();
    if path.is_empty() || path.chars().all(|character| character.is_ascii_digit()) {
        return None;
    }
    Some((path.to_string(), line, column))
}

/// The compiler prints paths relative to the build root; the UI keys diagnostics by absolute path.
pub fn absolute_text_path(path: &str, build_root: &Path) -> String {
    let candidate = Path::new(path);
    let resolved = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        build_root.join(candidate)
    };
    resolved.to_string_lossy().into_owned()
}
