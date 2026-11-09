#![allow(unused_imports)]

pub(crate) use crate::resolve;
pub(crate) use crate::types::{GitFileDiff, GitStatus, GitStatusEntry};
pub use serde::Serialize;
pub use std::fs;
pub use std::path::Path;
pub use std::process::Command;

use crate::atomic_write::TempDir;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

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

/// The patch file inside its private directory.
pub const PATCH_FILE_NAME: &str = "hunk.patch";

/// A patch file that owns the private directory holding it, so dropping it removes both.
pub struct HunkPatchFile {
    directory: TempDir,
}

impl HunkPatchFile {
    pub fn path(&self) -> PathBuf {
        self.directory.path().join(PATCH_FILE_NAME)
    }

    /// The private directory that owns the patch; it no longer exists after a drop.
    #[cfg(test)]
    pub fn directory(&self) -> &Path {
        self.directory.path()
    }
}

/// Writes the patch into a fresh private directory, never to a name another process can predict.
///
/// The directory is created with `create_dir`, which refuses an existing path, and the file with
/// `create_new`, so a symlink planted at a shared temp name can neither receive the write nor be
/// read back by git.
pub fn write_hunk_patch(patch: &str) -> Result<HunkPatchFile, String> {
    let directory =
        TempDir::create("quarry-hunk").map_err(|error| format!("cannot write patch: {error}"))?;
    let path = directory.path().join(PATCH_FILE_NAME);
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&path)
        .map_err(|error| format!("cannot write patch: {error}"))?;
    file.write_all(patch.as_bytes())
        .map_err(|error| format!("cannot write patch: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("cannot write patch: {error}"))?;
    Ok(HunkPatchFile { directory })
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
    // Write patch to a file nothing else can name: a private directory per call, and a path that
    // must not exist, so a planted symlink cannot redirect the write.
    let patch_file = write_hunk_patch(&patch)?;
    let mut args = vec!["apply".to_string(), "--cached".to_string()];
    if reverse {
        args.push("-R".to_string());
    }
    args.push(patch_file.path().to_string_lossy().into_owned());
    let borrowed: Vec<&str> = args.iter().map(String::as_str).collect();
    let result = run(&program, root, &borrowed);
    // Dropping the guard removes the directory and the patch on every exit path below.
    drop(patch_file);
    let output = result?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(operation_error("git apply", &stderr));
    }
    Ok(())
}
