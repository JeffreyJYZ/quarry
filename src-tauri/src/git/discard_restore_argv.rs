#![allow(unused_imports)]

pub(crate) use crate::resolve;
pub(crate) use crate::types::{GitFileDiff, GitStatus, GitStatusEntry};
pub use serde::Serialize;
pub use std::fs;
pub use std::path::Path;
pub use std::process::Command;

use super::*;

/// Builds the argv for discarding tracked working-tree changes.
pub fn discard_restore_argv(paths: &[String]) -> Vec<String> {
    let mut argv = vec![
        "restore".to_string(),
        "--worktree".to_string(),
        "--".to_string(),
    ];
    argv.extend(paths.iter().cloned());
    argv
}

/// Builds the argv for removing untracked files.
pub fn discard_clean_argv(paths: &[String]) -> Vec<String> {
    let mut argv = vec!["clean".to_string(), "-f".to_string(), "--".to_string()];
    argv.extend(paths.iter().cloned());
    argv
}

/// Builds the argv for amending the last commit with a (possibly edited) message.
pub fn amend_argv(message: &str) -> Vec<String> {
    vec![
        "commit".to_string(),
        "--amend".to_string(),
        "-m".to_string(),
        message.to_string(),
    ]
}

/// Amend the last commit with `message`. Refuses an empty message.
#[tauri::command]
pub async fn git_amend(root: String, message: String) -> Result<String, String> {
    validate_commit_message(&message)?;
    tauri::async_runtime::spawn_blocking(move || amend(&root, &message))
        .await
        .map_err(|error| format!("git amend failed: {error}"))?
}

pub fn amend(root: &str, message: &str) -> Result<String, String> {
    let program = git_program()?;
    let output = Command::new(&program)
        .args(amend_argv(message))
        .current_dir(root)
        .output()
        .map_err(|error| format!("cannot run {program} in {root}: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if is_not_a_repository(&stderr) {
            return Err(format!("not a git repository: {root}"));
        }
        return Err(operation_error("git amend", &stderr));
    }

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
