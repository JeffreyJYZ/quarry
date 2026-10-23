#![allow(unused_imports)]

pub(crate) use crate::resolve;
pub(crate) use crate::types::{GitFileDiff, GitStatus, GitStatusEntry};
pub use serde::Serialize;
pub use std::fs;
pub use std::path::Path;
pub use std::process::Command;

use super::*;

/// Sorts branches: current first, then alphabetically by name.
pub fn sort_branches(branches: &mut [Branch]) {
    branches.sort_by(|left, right| {
        right
            .current
            .cmp(&left.current)
            .then_with(|| left.name.cmp(&right.name))
    });
}
pub fn validate_branch_name(branch: &str) -> Result<(), String> {
    if branch.is_empty() {
        return Err("branch name must not be empty".to_string());
    }
    if !branch
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || "._/-".contains(character))
    {
        return Err("branch name must contain only characters in [A-Za-z0-9._/-]".to_string());
    }
    if branch
        .split('/')
        .any(|segment| segment.is_empty() || segment == "..")
    {
        return Err("branch name must not contain '..' segments".to_string());
    }
    Ok(())
}

/// Builds the argv for `git checkout <branch>`.
pub fn checkout_argv(branch: &str) -> Vec<String> {
    vec!["checkout".to_string(), branch.to_string()]
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitEntry {
    pub hash: String,
    pub subject: String,
    pub author: String,
    pub when: String,
}

/// Default and bounds for `git_log`.
pub const DEFAULT_LOG_LIMIT: u32 = 50;

pub const MAX_LOG_LIMIT: u32 = 500;

pub const MIN_LOG_LIMIT: u32 = 1;

#[tauri::command]
pub async fn git_log(root: String, limit: Option<u32>) -> Result<Vec<GitCommitEntry>, String> {
    let limit = resolve_log_limit(limit)?;
    tauri::async_runtime::spawn_blocking(move || log(&root, limit))
        .await
        .map_err(|error| format!("git log failed: {error}"))?
}

pub fn log(root: &str, limit: u32) -> Result<Vec<GitCommitEntry>, String> {
    let program = git_program()?;
    let argv = log_argv(limit);
    let args: Vec<&str> = argv.iter().map(String::as_str).collect();
    let output = run(&program, root, &args)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_not_a_repository(&stderr) || is_no_commits(&stderr) {
            return Ok(Vec::new());
        }
        return Err(operation_error("git log", &stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_git_log(&stdout))
}

/// Resolves and validates the requested limit.
pub fn resolve_log_limit(limit: Option<u32>) -> Result<u32, String> {
    match limit {
        None => Ok(DEFAULT_LOG_LIMIT),
        Some(0) => Err(format!("limit must be at least {MIN_LOG_LIMIT}")),
        Some(value) => Ok(value.min(MAX_LOG_LIMIT)),
    }
}

/// Builds the argv for `git log`.
pub fn log_argv(limit: u32) -> Vec<String> {
    vec![
        "log".to_string(),
        format!("--max-count={}", limit),
        "--pretty=format:%h%x09%s%x09%an%x09%ar".to_string(),
    ]
}

/// Parses the tab-separated output of `git log`.
pub fn parse_git_log(stdout: &str) -> Vec<GitCommitEntry> {
    let mut entries = Vec::new();
    for line in stdout.lines() {
        if line.is_empty() {
            continue;
        }
        let mut fields = line.split('\t');
        let hash = fields.next().unwrap_or("").to_string();
        let subject = fields.next().unwrap_or("").to_string();
        let author = fields.next().unwrap_or("").to_string();
        let when = fields.next().unwrap_or("").to_string();
        entries.push(GitCommitEntry {
            hash,
            subject,
            author,
            when,
        });
    }
    entries
}

pub fn is_no_commits(stderr: &str) -> bool {
    stderr.contains("does not have any commits")
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommitDiff {
    pub hash: String,
    pub diff: String,
    pub binary: bool,
}

/// Validates a commit hash: 4 to 40 hex characters. Prevents flag injection.
pub fn validate_commit_hash(hash: &str) -> Result<(), String> {
    if hash.len() < 4 || hash.len() > 40 {
        return Err("commit hash must be 4 to 40 hex characters".to_string());
    }
    if !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("commit hash must contain only hex characters [0-9a-fA-F]".to_string());
    }
    Ok(())
}
