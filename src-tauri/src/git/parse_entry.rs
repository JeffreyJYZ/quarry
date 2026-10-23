#![allow(unused_imports)]

pub(crate) use crate::resolve;
pub(crate) use crate::types::{GitFileDiff, GitStatus, GitStatusEntry};
pub use serde::Serialize;
pub use std::fs;
pub use std::path::Path;
pub use std::process::Command;

use super::*;

/// `# branch.ab +2 -1` carries the two counts.
pub fn parse_ahead_behind(rest: &str) -> (u32, u32) {
    let mut ahead = 0;
    let mut behind = 0;
    for token in rest.split_whitespace() {
        let Some(value) = token.strip_prefix(['+', '-']) else {
            continue;
        };
        let Ok(number) = value.parse::<u32>() else {
            continue;
        };
        if token.starts_with('+') {
            ahead = number;
        } else {
            behind = number;
        }
    }
    (ahead, behind)
}
/// One entry line, in any of the four porcelain=v2 shapes.
pub fn parse_entry(line: &str) -> Option<Entry> {
    if let Some(rest) = line.strip_prefix("? ") {
        let path = unquote_path(rest.trim());
        if path.is_empty() {
            return None;
        }
        return Some(Entry {
            path,
            status: STATUS_UNTRACKED.to_string(),
            staged: false,
        });
    }

    if let Some(rest) = line.strip_prefix("1 ") {
        let fields: Vec<&str> = rest.splitn(8, ' ').collect();
        if fields.len() < 8 {
            return None;
        }
        let (x, y) = codes(fields[0]);
        let path = unquote_path(fields[7]);
        return entry(path, x, y);
    }

    if let Some(rest) = line.strip_prefix("2 ") {
        let fields: Vec<&str> = rest.splitn(9, ' ').collect();
        if fields.len() < 9 {
            return None;
        }
        let (x, y) = codes(fields[0]);
        let path = rename_path(fields[8]);
        return entry(path, x, y);
    }

    if let Some(rest) = line.strip_prefix("u ") {
        let fields: Vec<&str> = rest.splitn(10, ' ').collect();
        if fields.len() < 10 {
            return None;
        }
        let (x, y) = codes(fields[0]);
        let path = unquote_path(fields[9]);
        return entry(path, x, y);
    }

    None
}

/// The staged and unstaged codes of an XY pair.
pub fn codes(xy: &str) -> (char, char) {
    let mut chars = xy.chars();
    (chars.next().unwrap_or('.'), chars.next().unwrap_or('.'))
}

/// Builds an entry from the two status codes.
///
/// The staged code wins when it is set; otherwise the unstaged code names the change.
pub fn entry(path: String, x: char, y: char) -> Option<Entry> {
    if path.is_empty() {
        return None;
    }
    let code = if x != '.' { x } else { y };
    let status = status_name(code)?;
    let staged = x != '.' && x != '?';
    Some(Entry {
        path,
        status: status.to_string(),
        staged,
    })
}

/// Maps one porcelain code onto a status name.
pub fn status_name(code: char) -> Option<&'static str> {
    match code {
        'M' | 'T' => Some(STATUS_MODIFIED),
        'A' | 'C' => Some(STATUS_ADDED),
        'D' => Some(STATUS_DELETED),
        'R' => Some(STATUS_RENAMED),
        'U' | 'u' => Some(STATUS_CONFLICTED),
        '?' => Some(STATUS_UNTRACKED),
        _ => None,
    }
}

/// A rename line ends with `new path<TAB>original path`; the new path is the one shown.
pub fn rename_path(field: &str) -> String {
    let path = match field.split_once('\t') {
        Some((path, _original)) => path,
        None => field,
    };
    unquote_path(path.trim())
}

/// Undoes git's quoting of paths with control characters or non-ASCII bytes.
pub fn unquote_path(path: &str) -> String {
    if !path.starts_with('"') || !path.ends_with('"') || path.len() < 2 {
        return path.to_string();
    }

    let inner = &path[1..path.len() - 1];
    let mut out = String::with_capacity(inner.len());
    let mut chars = inner.chars();
    while let Some(character) = chars.next() {
        if character != '\\' {
            out.push(character);
            continue;
        }
        match chars.next() {
            Some('t') => out.push('\t'),
            Some('n') => out.push('\n'),
            Some('r') => out.push('\r'),
            Some('"') => out.push('"'),
            Some('\\') => out.push('\\'),
            Some(digit @ '0'..='7') => {
                let mut code = digit.to_digit(8).unwrap_or(0);
                for _ in 0..2 {
                    let Some(next @ '0'..='7') = chars.next() else {
                        break;
                    };
                    code = code * 8 + next.to_digit(8).unwrap_or(0);
                }
                out.push(char::from_u32(code).unwrap_or('\u{fffd}'));
            }
            Some(other) => out.push(other),
            None => out.push('\\'),
        }
    }
    out
}
