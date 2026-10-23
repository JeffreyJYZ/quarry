#![allow(unused_imports)]

pub(crate) use crate::resolve;
pub(crate) use crate::types::{GitFileDiff, GitStatus, GitStatusEntry};
pub use serde::Serialize;
pub use std::fs;
pub use std::path::Path;
pub use std::process::Command;

use super::*;

/// Stage paths (relative to `root` or absolute inside it). Never a shell, never outside the root.
#[tauri::command]
pub async fn git_stage(root: String, paths: Vec<String>) -> Result<(), String> {
    let validated = validate_paths(&root, &paths)?;
    tauri::async_runtime::spawn_blocking(move || stage(&root, &validated))
        .await
        .map_err(|error| format!("git stage failed: {error}"))?
}

#[tauri::command]
pub async fn git_unstage(root: String, paths: Vec<String>) -> Result<(), String> {
    let validated = validate_paths(&root, &paths)?;
    tauri::async_runtime::spawn_blocking(move || unstage(&root, &validated))
        .await
        .map_err(|error| format!("git unstage failed: {error}"))?
}

pub fn stage(root: &str, paths: &[String]) -> Result<(), String> {
    run_mutation(root, paths, &["add", "--"], "git stage")
}

pub fn unstage(root: &str, paths: &[String]) -> Result<(), String> {
    run_mutation(root, paths, &["restore", "--staged", "--"], "git unstage")
}

pub fn run_mutation(
    root: &str,
    paths: &[String],
    head: &[&str],
    operation: &str,
) -> Result<(), String> {
    let program = git_program()?;
    let mut command = Command::new(&program);
    command.args(head).args(paths).current_dir(root);
    let output = command
        .output()
        .map_err(|error| format!("cannot run {program} in {root}: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_not_a_repository(&stderr) {
            return Err(format!("not a git repository: {root}"));
        }
        return Err(operation_error(operation, &stderr));
    }
    Ok(())
}

pub fn validate_path(root: &str, path: &str) -> Result<String, String> {
    if path.is_empty() {
        return Err("path must not be empty".to_string());
    }
    let canonical_root = fs::canonicalize(root).unwrap_or_else(|_| std::path::PathBuf::from(root));
    let given = std::path::Path::new(path);
    for component in given.components() {
        if let std::path::Component::ParentDir = component {
            return Err(format!("path escapes the repository root: {path}"));
        }
    }
    if given.is_absolute() && !given.starts_with(&canonical_root) && !given.starts_with(root) {
        return Err(format!("path is outside the repository root: {path}"));
    }
    Ok(path.to_string())
}

pub fn validate_paths(root: &str, paths: &[String]) -> Result<Vec<String>, String> {
    if paths.is_empty() {
        return Err("no paths given".to_string());
    }
    let mut validated = Vec::with_capacity(paths.len());
    for path in paths {
        validated.push(validate_path(root, path)?);
    }
    Ok(validated)
}

/// Validates a commit message before it reaches git.
pub fn validate_commit_message(message: &str) -> Result<(), String> {
    if message.trim().is_empty() {
        return Err("commit message must not be empty".to_string());
    }
    if message.len() > 4096 {
        return Err("commit message exceeds 4096 bytes".to_string());
    }
    Ok(())
}

/// Builds the argv for `git commit`, with the message as the value of `-m`.
pub fn commit_argv(message: &str) -> Vec<String> {
    vec!["commit".to_string(), "-m".to_string(), message.to_string()]
}
