#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{ProjectKind, TestItem, TestReport};
pub use std::io::{BufRead, BufReader, Read};
pub use std::process::{ExitStatus, Stdio};
pub use std::sync::{Arc, Mutex};
pub use std::thread;
pub use std::time::{Duration, Instant};

use super::*;

/// One target cargo built with the test harness: the file its cases live in, and the binary that
/// lists them.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TestBinary {
    /// Source path relative to the project root, always forward-slashed, as the dock labels it.
    pub label: String,
    /// The executable cargo built for that target.
    pub executable: String,
}

/// The test binaries named by `cargo test --no-run --message-format=json`.
///
/// Cargo reports every target it built as `compiler-artifact`; only a target whose
/// `profile.test` is true was built with the harness, which is what makes its executable able to
/// answer `--list`. Dependency artefacts carry `test: false`, and their executable is null.
///
/// The list is sorted by label and deduplicated by executable, so the same tree twice answers the
/// same order: cargo's own stdout order is not a contract, and the dock should not reorder itself
/// between two discovery runs.
pub fn test_binaries(stdout: &str, root: &str) -> Vec<TestBinary> {
    let mut binaries: Vec<TestBinary> = Vec::new();

    for line in stdout.lines() {
        let Some(binary) = test_binary(line, root) else {
            continue;
        };
        if binaries
            .iter()
            .any(|seen| seen.executable == binary.executable)
        {
            continue;
        }
        binaries.push(binary);
    }

    binaries.sort_by(|left, right| left.label.cmp(&right.label));
    binaries
}

/// One artefact line as a test binary, or `None` for a dependency, a prose line or a JSON line
/// without an executable.
fn test_binary(line: &str, root: &str) -> Option<TestBinary> {
    let message: serde_json::Value = serde_json::from_str(line.trim()).ok()?;
    if message.get("reason")?.as_str()? != "compiler-artifact" {
        return None;
    }
    if !message.pointer("/profile/test")?.as_bool()? {
        return None;
    }
    let executable = message.get("executable")?.as_str()?.to_string();
    let source = message.pointer("/target/src_path")?.as_str()?;
    Some(TestBinary {
        label: source_label(root, source),
        executable,
    })
}

/// A target's source file relative to the project root, forward-slashed on every platform.
///
/// Windows is why this compares segments instead of bytes: the root arrives canonicalised (which
/// can carry a verbatim `\\?\` prefix) and cargo's `src_path` does not, and the two spell the same
/// drive and directory in whatever case they were written. A source outside the root is kept
/// whole rather than shortened into a misleading label.
pub fn source_label(root: &str, source: &str) -> String {
    let root_parts = segments(root);
    let source_parts = segments(source);
    let depth = root_parts.len();
    let under_root = !root_parts.is_empty()
        && source_parts.len() > depth
        && root_parts
            .iter()
            .zip(&source_parts)
            .all(|(left, right)| same_segment(left, right));

    if under_root {
        source_parts[depth..].join("/")
    } else {
        plain_path(source)
    }
}

/// A path with both separators read as `/` and a verbatim prefix dropped, otherwise as written.
fn plain_path(path: &str) -> String {
    let slashed = path.replace('\\', "/");
    slashed
        .strip_prefix("//?/")
        .or_else(|| slashed.strip_prefix("//./"))
        .unwrap_or(&slashed)
        .to_string()
}

/// A path's segments, relative ones and absolute ones alike.
fn segments(path: &str) -> Vec<String> {
    plain_path(path)
        .split('/')
        .filter(|segment| !segment.is_empty())
        .map(str::to_string)
        .collect()
}

/// Path segments are case-blind on Windows, which is the one platform where two spellings of a
/// drive can name one file.
fn same_segment(left: &str, right: &str) -> bool {
    if cfg!(windows) {
        left.eq_ignore_ascii_case(right)
    } else {
        left == right
    }
}
