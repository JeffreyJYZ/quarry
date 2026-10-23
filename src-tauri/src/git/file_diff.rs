#![allow(unused_imports)]

pub(crate) use crate::resolve;
pub(crate) use crate::types::{GitFileDiff, GitStatus, GitStatusEntry};
pub use serde::Serialize;
pub use std::fs;
pub use std::path::Path;
pub use std::process::Command;

use super::*;

/// Reads the working tree state. A directory without a repository is not an error.
pub fn status(root: &str) -> Result<GitStatus, String> {
    let program = git_program()?;
    let output = run(
        &program,
        root,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "--untracked-files=all",
        ],
    )?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_not_a_repository(&stderr) {
            return Ok(GitStatus {
                branch: None,
                entries: Vec::new(),
                ahead: 0,
                behind: 0,
            });
        }
        return Err(operation_error("git status", &stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parts = parse_status(&stdout);
    let entries = parts
        .entries
        .into_iter()
        .map(|entry| GitStatusEntry {
            path: absolute_path(root, &entry.path),
            status: entry.status,
            staged: entry.staged,
        })
        .collect();

    Ok(GitStatus {
        branch: parts.branch,
        entries,
        ahead: parts.ahead,
        behind: parts.behind,
    })
}
/// Reads one file's diff against `HEAD`.
///
/// A repository without commits has no `HEAD`, so the diff falls back to the working tree against
/// the index. An untracked file has no diff at all: its whole content becomes an added hunk.
pub fn file_diff(root: &str, path: &str) -> Result<GitFileDiff, String> {
    let program = git_program()?;
    let relative = relative_path(root, path);

    let mut output = run(
        &program,
        root,
        &["diff", "--no-color", "--unified=3", "HEAD", "--", &relative],
    )?;
    if !output.status.success() {
        output = run(&program, root, &["diff", "--no-color", "--", &relative])?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(operation_error("git diff", &stderr));
        }
    }

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    if has_hunk(&stdout) {
        return Ok(GitFileDiff {
            path: absolute_path(root, &relative),
            diff: stdout,
            binary: false,
        });
    }

    if is_untracked(&program, root, &relative) {
        let content = read_file(root, &relative)?;
        if content.as_bytes().contains(&0) {
            return Ok(GitFileDiff {
                path: absolute_path(root, &relative),
                diff: String::new(),
                binary: true,
            });
        }
        return Ok(GitFileDiff {
            path: absolute_path(root, &relative),
            diff: untracked_diff(&relative, &content),
            binary: false,
        });
    }

    Ok(GitFileDiff {
        path: absolute_path(root, &relative),
        diff: String::new(),
        binary: true,
    })
}

/// Parses the porcelain=v2 stream into branch, ahead/behind counts and entries.
pub fn parse_status(stdout: &str) -> StatusParts {
    let mut parts = StatusParts {
        branch: None,
        entries: Vec::new(),
        ahead: 0,
        behind: 0,
    };

    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix("# branch.head ") {
            let name = rest.trim();
            parts.branch = (!name.is_empty() && name != "(detached)").then(|| name.to_string());
            continue;
        }
        if let Some(rest) = line.strip_prefix("# branch.ab ") {
            let (ahead, behind) = parse_ahead_behind(rest);
            parts.ahead = ahead;
            parts.behind = behind;
            continue;
        }
        if line.starts_with('#') {
            continue;
        }
        if let Some(entry) = parse_entry(line) {
            parts.entries.push(entry);
        }
    }

    parts
}
