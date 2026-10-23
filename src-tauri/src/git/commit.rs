#![allow(unused_imports)]

pub(crate) use crate::resolve;
pub(crate) use crate::types::{GitFileDiff, GitStatus, GitStatusEntry};
pub use serde::Serialize;
pub use std::fs;
pub use std::path::Path;
pub use std::process::Command;

use super::*;

/// Commit the staged changes with `message`. Refuses an empty message or an empty index.
#[tauri::command]
pub async fn git_commit(root: String, message: String) -> Result<String, String> {
    validate_commit_message(&message)?;
    tauri::async_runtime::spawn_blocking(move || commit(&root, &message))
        .await
        .map_err(|error| format!("git commit failed: {error}"))?
}
pub fn commit(root: &str, message: &str) -> Result<String, String> {
    let program = git_program()?;

    // Refuse an empty index before touching commit: a zero exit means "nothing staged".
    let staged_check = Command::new(&program)
        .args(["diff", "--cached", "--quiet"])
        .current_dir(root)
        .output()
        .map_err(|error| format!("cannot run {program} in {root}: {error}"))?;
    let stderr = String::from_utf8_lossy(&staged_check.stderr);
    if is_not_a_repository(&stderr) {
        return Err(format!("not a git repository: {root}"));
    }
    if staged_check.status.success() {
        return Err("nothing staged to commit; stage something first".to_string());
    }

    let output = Command::new(&program)
        .args(commit_argv(message))
        .current_dir(root)
        .output()
        .map_err(|error| format!("cannot run {program} in {root}: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_not_a_repository(&stderr) {
            return Err(format!("not a git repository: {root}"));
        }
        return Err(operation_error("git commit", &stderr));
    }

    // The commit already landed; a failed rev-parse must not turn success into failure.
    let hash_output = Command::new(&program)
        .args(["rev-parse", "--short", "HEAD"])
        .current_dir(root)
        .output();
    match hash_output {
        Ok(result) if result.status.success() => {
            Ok(String::from_utf8_lossy(&result.stdout).trim().to_string())
        }
        _ => Ok(String::new()),
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub current: bool,
}

#[tauri::command]
pub async fn git_branches(root: String) -> Result<Vec<Branch>, String> {
    tauri::async_runtime::spawn_blocking(move || branches(&root))
        .await
        .map_err(|error| format!("git branch failed: {error}"))?
}

/// Switch branches. Never forces: git's own refusal on a dirty tree is the answer.
#[tauri::command]
pub async fn git_checkout(root: String, branch: String) -> Result<(), String> {
    validate_branch_name(&branch)?;
    tauri::async_runtime::spawn_blocking(move || checkout(&root, &branch))
        .await
        .map_err(|error| format!("git checkout failed: {error}"))?
}

pub fn branches(root: &str) -> Result<Vec<Branch>, String> {
    let program = git_program()?;
    let output = run(
        &program,
        root,
        &["branch", "--format=%(refname:short)%09%(HEAD)"],
    )?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_not_a_repository(&stderr) {
            return Ok(Vec::new());
        }
        return Err(operation_error("git branch", &stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut parsed = parse_branches(&stdout);
    sort_branches(&mut parsed);
    Ok(parsed)
}

pub fn checkout(root: &str, branch: &str) -> Result<(), String> {
    let program = git_program()?;
    let output = Command::new(&program)
        .args(checkout_argv(branch))
        .current_dir(root)
        .output()
        .map_err(|error| format!("cannot run {program} in {root}: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_not_a_repository(&stderr) {
            return Err(format!("not a git repository: {root}"));
        }
        return Err(operation_error("git checkout", &stderr));
    }
    Ok(())
}

/// Parses the tab-separated output of `git branch --format=...`.
pub fn parse_branches(stdout: &str) -> Vec<Branch> {
    let mut branches = Vec::new();
    for line in stdout.lines() {
        if line.is_empty() {
            continue;
        }
        let mut parts = line.split('\t');
        let name = parts.next().unwrap_or("").trim();
        if name.is_empty() {
            continue;
        }
        let head = parts.next().unwrap_or("");
        let current = head.trim() == "*";
        branches.push(Branch {
            name: name.to_string(),
            current,
        });
    }
    branches
}
