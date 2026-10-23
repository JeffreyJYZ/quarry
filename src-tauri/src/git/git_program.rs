#![allow(unused_imports)]

pub(crate) use crate::resolve;
pub(crate) use crate::types::{GitFileDiff, GitStatus, GitStatusEntry};
pub use serde::Serialize;
pub use std::fs;
pub use std::path::Path;
pub use std::process::Command;

use super::*;

/// Program used to talk to git; it is never bundled.
pub const GIT_PROGRAM: &str = "git";

/// Longest stderr excerpt kept in an error message.
pub const ERROR_LIMIT: usize = 300;

/// Status names the frontend knows.
pub const STATUS_MODIFIED: &str = "modified";

pub const STATUS_ADDED: &str = "added";

pub const STATUS_DELETED: &str = "deleted";

pub const STATUS_RENAMED: &str = "renamed";

pub const STATUS_UNTRACKED: &str = "untracked";

pub const STATUS_CONFLICTED: &str = "conflicted";

#[tauri::command]
pub async fn git_status(root: String) -> Result<GitStatus, String> {
    tauri::async_runtime::spawn_blocking(move || status(&root))
        .await
        .map_err(|error| format!("git status failed: {error}"))?
}

#[tauri::command]
pub async fn git_file_diff(root: String, path: String) -> Result<GitFileDiff, String> {
    tauri::async_runtime::spawn_blocking(move || file_diff(&root, &path))
        .await
        .map_err(|error| format!("git diff failed: {error}"))?
}

/// One changed path, relative to the project root.
pub struct Entry {
    pub(crate) path: String,
    pub(crate) status: String,
    pub(crate) staged: bool,
}

/// The parsed porcelain stream, before paths are made absolute.
pub struct StatusParts {
    pub(crate) branch: Option<String>,
    pub(crate) entries: Vec<Entry>,
    pub(crate) ahead: u32,
    pub(crate) behind: u32,
}
