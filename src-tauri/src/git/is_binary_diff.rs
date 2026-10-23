#![allow(unused_imports)]

pub(crate) use crate::resolve;
pub(crate) use crate::types::{GitFileDiff, GitStatus, GitStatusEntry};
pub use serde::Serialize;
pub use std::fs;
pub use std::path::Path;
pub use std::process::Command;

use super::*;

/// Builds the argv for `git show` of one commit.
pub fn commit_diff_argv(hash: &str) -> Vec<String> {
    vec![
        "show".to_string(),
        "--no-color".to_string(),
        "--unified=3".to_string(),
        "--format=".to_string(),
        hash.to_string(),
    ]
}
/// True when the output is a binary diff or has no text hunk.
pub fn is_binary_diff(output: &str) -> bool {
    if output.contains("Binary files") && output.contains("differ") {
        return true;
    }
    let has_hunk = output.lines().any(|line| line.starts_with("@@"));
    let has_pair = output.contains("---") && output.contains("+++");
    !(has_hunk || has_pair)
}

pub fn trim_trailing_blank_lines(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }
    let trimmed = text.trim_end_matches('\n');
    let mut out = trimmed.to_string();
    out.push('\n');
    out
}

/// Unified diff of one commit against its first parent.
#[tauri::command]
pub async fn git_commit_diff(root: String, hash: String) -> Result<CommitDiff, String> {
    validate_commit_hash(&hash)?;
    tauri::async_runtime::spawn_blocking(move || commit_diff(&root, &hash))
        .await
        .map_err(|error| format!("git show failed: {error}"))?
}

pub fn commit_diff(root: &str, hash: &str) -> Result<CommitDiff, String> {
    let program = git_program()?;
    let argv = commit_diff_argv(hash);
    let args: Vec<&str> = argv.iter().map(String::as_str).collect();
    let output = run(&program, root, &args)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_not_a_repository(&stderr) {
            return Err(format!("not a git repository: {root}"));
        }
        return Err(operation_error("git show", &stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let binary = is_binary_diff(&stdout);
    let diff = if binary {
        String::new()
    } else {
        trim_trailing_blank_lines(&stdout)
    };

    Ok(CommitDiff {
        hash: hash.to_string(),
        diff,
        binary,
    })
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BlameLine {
    pub line: u32,
    pub hash: String,
    pub author: String,
    pub subject: String,
}

/// Cap on parsed blame lines, so a generated file cannot exhaust memory.
pub const BLAME_CAP: usize = 20_000;

/// Per-line blame for one file. Read-only.
#[tauri::command]
pub async fn git_blame(root: String, path: String) -> Result<Vec<BlameLine>, String> {
    let validated = validate_path(&root, &path)?;
    let relative = relative_path(&root, &validated);
    tauri::async_runtime::spawn_blocking(move || blame(&root, &relative))
        .await
        .map_err(|error| format!("git blame failed: {error}"))?
}

pub fn blame(root: &str, relative: &str) -> Result<Vec<BlameLine>, String> {
    let program = git_program()?;
    let output = run(
        &program,
        root,
        &["blame", "--line-porcelain", "--", relative],
    )?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_not_a_repository(&stderr) {
            return Err(format!("not a git repository: {root}"));
        }
        if stderr.contains("no such path") {
            return Ok(Vec::new());
        }
        return Err(operation_error("git blame", &stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_git_blame(&stdout, BLAME_CAP))
}
