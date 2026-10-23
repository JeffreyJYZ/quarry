#![allow(unused_imports)]

pub(crate) use crate::resolve;
pub(crate) use crate::types::{GitFileDiff, GitStatus, GitStatusEntry};
pub use serde::Serialize;
pub use std::fs;
pub use std::path::Path;
pub use std::process::Command;

use super::*;

/// Splits a unified diff into (header, body) hunk tuples.
pub fn split_hunks(diff: &str) -> Vec<(String, Vec<String>)> {
    let mut out = Vec::new();
    let mut current: Option<(String, Vec<String>)> = None;
    for line in diff.lines() {
        if line.starts_with("@@") {
            if let Some((h, b)) = current.take() {
                out.push((h, b));
            }
            current = Some((line.to_string(), Vec::new()));
        } else if let Some((_, b)) = current.as_mut() {
            b.push(line.to_string());
        }
    }
    if let Some((h, b)) = current.take() {
        out.push((h, b));
    }
    out
}
/// Builds a single-hunk patch from a full diff and a hunk id.
/// Returns None when the id is not present (stale hunk).
pub fn build_hunk_patch(diff: &str, id: &str) -> Option<String> {
    let headers: Vec<&str> = diff
        .lines()
        .filter(|l| {
            l.starts_with("diff ")
                || l.starts_with("---")
                || l.starts_with("+++ ")
                || l.starts_with("index ")
                || l.starts_with("new file")
                || l.starts_with("deleted file")
        })
        .collect();
    for (header, body) in split_hunks(diff) {
        let body_refs: Vec<&str> = body.iter().map(String::as_str).collect();
        if hunk_id(&header, &body_refs) == id {
            let mut patch = String::new();
            for h in &headers {
                patch.push_str(h);
                patch.push('\n');
            }
            patch.push_str(&header);
            patch.push('\n');
            for b in &body {
                patch.push_str(b);
                patch.push('\n');
            }
            return Some(patch);
        }
    }
    None
}

#[tauri::command]
pub async fn git_stage_hunk(root: String, path: String, hunk_id: String) -> Result<(), String> {
    let validated = validate_path(&root, &path)?;
    tauri::async_runtime::spawn_blocking(move || stage_hunk(&root, &validated, &hunk_id, false))
        .await
        .map_err(|e| format!("git stage hunk failed: {e}"))?
}

#[tauri::command]
pub async fn git_unstage_hunk(root: String, path: String, hunk_id: String) -> Result<(), String> {
    let validated = validate_path(&root, &path)?;
    tauri::async_runtime::spawn_blocking(move || stage_hunk(&root, &validated, &hunk_id, true))
        .await
        .map_err(|e| format!("git stage hunk failed: {e}"))?
}

pub fn stage_hunk(root: &str, path: &str, id: &str, reverse: bool) -> Result<(), String> {
    let relative = relative_path(root, path);
    let program = git_program()?;
    // Re-read the diff so a stale hunk is refused.
    let diff_text = if reverse {
        // staged diff
        let output = run(
            &program,
            root,
            &[
                "diff",
                "--cached",
                "--no-color",
                "--unified=3",
                "--",
                &relative,
            ],
        )?;
        String::from_utf8_lossy(&output.stdout).into_owned()
    } else {
        file_diff(root, path)?.diff
    };
    let patch = match build_hunk_patch(&diff_text, id) {
        Some(p) => p,
        None => {
            return Err(
                "file changed on disk since diff was loaded; refresh and retry".to_string(),
            );
        }
    };
    // Write patch to temp file
    let tmp = std::env::temp_dir().join(format!("quarry-hunk-{}.patch", id));
    std::fs::write(&tmp, patch.as_bytes()).map_err(|e| format!("cannot write patch: {e}"))?;
    let mut args = vec!["apply".to_string(), "--cached".to_string()];
    if reverse {
        args.push("-R".to_string());
    }
    args.push(tmp.to_string_lossy().into_owned());
    let output = Command::new(&program)
        .args(&args)
        .current_dir(root)
        .output()
        .map_err(|e| format!("cannot run git: {e}"))?;
    let _ = std::fs::remove_file(&tmp);
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(operation_error("git apply", &stderr));
    }
    Ok(())
}
