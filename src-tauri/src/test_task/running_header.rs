#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{ProjectKind, TestItem, TestReport};
pub use std::io::{BufRead, BufReader, Read};
pub use std::process::{ExitStatus, Stdio};
pub use std::sync::{Arc, Mutex};
pub use std::thread;
pub use std::time::{Duration, Instant};

use super::*;

/// Parses `--list --format terse` output: `path::name: test` lines, deduplicated by name.
///
/// `: bench` lines and anything that does not end in `: test` are ignored, and an inner `::` stays
/// part of the name. Each name takes the label of the closest preceding `Running unittests …` or
/// `Running tests/…` header, falling back to the crate name for tests listed before any header.
pub fn parse_tests(merged: &str, crate_name: &str) -> Vec<TestItem> {
    let mut binary = crate_name.to_string();
    let mut seen = std::collections::HashSet::new();
    let mut items = Vec::new();

    for line in merged.lines() {
        let line = line.trim();
        if let Some(header) = running_header(line) {
            binary = header.to_string();
            continue;
        }
        let Some(name) = test_name(line) else {
            continue;
        };
        if !seen.insert(name.clone()) {
            continue;
        }
        items.push(TestItem {
            name,
            binary: binary.clone(),
        });
    }

    items
}
/// The binary label of a cargo `Running …` header: the source path, when one is named.
pub fn running_header(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("Running ")?;
    let rest = rest
        .strip_prefix("unittests ")
        .or_else(|| rest.strip_prefix("tests "))?;
    rest.split_whitespace()
        .next()
        .filter(|label| !label.is_empty())
        .or(Some(rest.trim()))
}

/// The test name on a line ending in `: test`; `: bench`, `: test extra` and prose yield nothing.
pub fn test_name(line: &str) -> Option<String> {
    let name = line.strip_suffix(TEST_SUFFIX)?;
    if name.is_empty() {
        return None;
    }
    Some(name.to_string())
}

/// Last `OUTPUT_LINE_LIMIT` lines, with repeats of cargo's download chatter dropped.
pub fn tail_output(lines: &[String]) -> String {
    let mut seen_noise = std::collections::HashSet::new();
    let kept: Vec<&str> = lines
        .iter()
        .map(String::as_str)
        .filter(|line| !is_noise(line) || seen_noise.insert(*line))
        .collect();
    let start = kept.len().saturating_sub(OUTPUT_LINE_LIMIT);
    kept[start..].join("\n")
}

pub fn is_noise(line: &str) -> bool {
    let line = line.trim_start();
    NOISE_PREFIXES.iter().any(|prefix| line.starts_with(prefix))
}

/// The command's own name, its build root and cargo's first stderr line, in one short string.
pub fn failure_error(operation: &str, build_root: &str, lines: &[Line]) -> String {
    let detail = lines
        .iter()
        .find(|line| line.stderr && !line.text.trim().is_empty())
        .map(|line| truncate(line.text.trim(), ERROR_LINE_LIMIT))
        .unwrap_or_else(|| "cargo reported no output".to_string());
    format!("cannot {operation} in {build_root}: {detail}")
}

pub fn timeout_error(operation: &str, timeout: Duration) -> String {
    format!(
        "{operation} timed out after {} s: cargo was killed",
        timeout.as_secs()
    )
}

pub fn truncate(text: &str, limit: usize) -> String {
    text.chars().take(limit).collect()
}
