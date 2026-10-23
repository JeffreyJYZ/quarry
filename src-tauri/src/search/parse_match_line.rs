#![allow(unused_imports)]

pub(crate) use crate::ignore;
pub(crate) use crate::types::{SearchMatch, SearchReport};
pub use regex::RegexBuilder;
pub use serde_json::Value;
pub use std::env;
pub use std::fs;
pub use std::io::{BufRead, BufReader, Read};
pub use std::path::{Path, PathBuf};
pub use std::process::{Child, Command, ExitStatus, Stdio};
pub use std::thread::{self, JoinHandle};
pub use std::time::Instant;

use super::*;

/// Collects matches from a stream of JSON lines, stopping as soon as the cap is hit.
pub fn collect_matches(
    lines: impl Iterator<Item = impl AsRef<str>>,
    root: &Path,
    max_results: u32,
) -> (Vec<SearchMatch>, bool) {
    let mut matches = Vec::new();
    for line in lines {
        if let Some(found) = parse_match_line(line.as_ref(), root) {
            matches.push(found);
            if matches.len() >= max_results as usize {
                return (matches, true);
            }
        }
    }
    (matches, false)
}
/// Parses one JSON line; every record except `match` (and every malformed line) yields `None`.
pub fn parse_match_line(line: &str, root: &Path) -> Option<SearchMatch> {
    let record = serde_json::from_str::<Value>(line).ok()?;
    if record["type"].as_str() != Some("match") {
        return None;
    }

    let data = &record["data"];
    let path = data["path"]["text"].as_str()?;
    let text = data["lines"]["text"].as_str()?;
    let line_number = data["line_number"].as_u64()?;
    // The first submatch sits at the start of the reported column; a missing one falls back to 1.
    let start = data["submatches"]
        .as_array()
        .and_then(|submatches| submatches.first())
        .and_then(|submatch| submatch["start"].as_u64())
        .unwrap_or(0);

    Some(SearchMatch {
        path: absolute_match_path(path, root),
        line: u32::try_from(line_number).unwrap_or(u32::MAX),
        column: u32::try_from(start).unwrap_or(u32::MAX).saturating_add(1),
        text: strip_trailing_newline(text).to_string(),
    })
}

/// ripgrep already emits absolute paths for an absolute root; join defensively when it does not.
pub fn absolute_match_path(path: &str, root: &Path) -> String {
    let path = Path::new(path);
    if path.is_absolute() {
        return path.to_string_lossy().into_owned();
    }
    root.join(path).to_string_lossy().into_owned()
}

/// Makes a relative root absolute without resolving symlinks, so reported paths stay keyed to the
/// root the UI opened.
pub fn absolute_root(root: &str) -> PathBuf {
    let path = PathBuf::from(root);
    std::path::absolute(&path).unwrap_or(path)
}

/// `lines.text` carries the newline that ended the line; the UI renders the line itself.
pub fn strip_trailing_newline(text: &str) -> &str {
    text.strip_suffix("\r\n")
        .or_else(|| text.strip_suffix('\n'))
        .unwrap_or(text)
}

/// Stable order for the UI: by path, then by line.
pub fn sort_matches(matches: &mut [SearchMatch]) {
    matches.sort_by(|a, b| {
        a.path
            .cmp(&b.path)
            .then(a.line.cmp(&b.line))
            .then(a.column.cmp(&b.column))
    });
}

/// Drains stderr on its own thread, so a talkative failure cannot fill the pipe and deadlock.
pub fn drain_stderr(child: &mut Child) -> Option<JoinHandle<String>> {
    let stderr = child.stderr.take()?;
    Some(thread::spawn(move || {
        let mut text = String::new();
        let _ = BufReader::new(stderr).read_to_string(&mut text);
        text
    }))
}

/// Walk `PATH` by hand rather than shelling out, matching how the toolchain probe resolves tools.
pub fn find_program(name: &str) -> Option<String> {
    let path = env::var_os("PATH")?;
    env::split_paths(&path).find_map(|dir| {
        if dir.as_os_str().is_empty() {
            return None;
        }
        let candidate = dir.join(name);
        is_executable(&candidate).then(|| candidate.to_string_lossy().into_owned())
    })
}

#[cfg(unix)]
pub fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    fs::metadata(path)
        .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
pub fn is_executable(path: &Path) -> bool {
    fs::metadata(path)
        .map(|meta| meta.is_file())
        .unwrap_or(false)
}

pub fn ripgrep_error(binary: &str, status: &ExitStatus, stderr: &str) -> String {
    let detail = stderr
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("no stderr output");
    format!("{binary} failed ({status}): {}", detail.trim())
}

pub fn elapsed_ms(started: Instant) -> u64 {
    u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX)
}
