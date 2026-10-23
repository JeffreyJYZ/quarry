#![allow(unused_imports)]

pub(crate) use crate::resolve;
pub(crate) use crate::types::{GitFileDiff, GitStatus, GitStatusEntry};
pub use serde::Serialize;
pub use std::fs;
pub use std::path::Path;
pub use std::process::Command;

use super::*;

/// Parses `git blame --line-porcelain` output into one entry per final file line.
pub fn parse_git_blame(stdout: &str, cap: usize) -> Vec<BlameLine> {
    let mut out: Vec<BlameLine> = Vec::new();
    let mut current: Option<(String, u32, usize, String, String)> = None;

    for line in stdout.lines() {
        if line.starts_with('\t') {
            continue;
        }
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() >= 3
            && fields[0].len() >= 40
            && fields[0].chars().all(|c| c.is_ascii_hexdigit())
        {
            if let Some((hash, start, count, author, subject)) = current.take() {
                for offset in 0..count {
                    if out.len() >= cap {
                        break;
                    }
                    out.push(BlameLine {
                        line: start + offset as u32,
                        hash: hash.clone(),
                        author: author.clone(),
                        subject: subject.clone(),
                    });
                }
            }
            let hash: String = fields[0].chars().take(8).collect();
            let start: u32 = fields[2].parse().unwrap_or(0);
            let count: usize = fields
                .get(3)
                .and_then(|v| v.parse().ok())
                .unwrap_or(1)
                .max(1);
            current = Some((hash, start, count, String::new(), String::new()));
            continue;
        }
        if let Some(entry) = current.as_mut() {
            if let Some(rest) = line.strip_prefix("author ") {
                entry.3 = rest.to_string();
            } else if let Some(rest) = line.strip_prefix("summary ") {
                entry.4 = rest.to_string();
            }
        }
    }

    if let Some((hash, start, count, author, subject)) = current.take() {
        for offset in 0..count {
            if out.len() >= cap {
                break;
            }
            out.push(BlameLine {
                line: start + offset as u32,
                hash: hash.clone(),
                author: author.clone(),
                subject: subject.clone(),
            });
        }
    }

    out.truncate(cap);
    out
}

/// Throw away working-tree changes for the given paths (never staged history).
#[tauri::command]
pub async fn git_discard(root: String, paths: Vec<String>) -> Result<(), String> {
    let validated = validate_paths(&root, &paths)?;
    for path in &paths {
        let candidate = if std::path::Path::new(path).is_absolute() {
            std::path::PathBuf::from(path)
        } else {
            std::path::PathBuf::from(&root).join(path)
        };
        if candidate.is_dir() {
            return Err(format!("directory not allowed: {path}"));
        }
    }
    tauri::async_runtime::spawn_blocking(move || discard(&root, &validated))
        .await
        .map_err(|error| format!("git discard failed: {error}"))?
}

pub fn discard(root: &str, paths: &[String]) -> Result<(), String> {
    let program = git_program()?;

    let mut tracked: Vec<String> = Vec::new();
    let mut untracked: Vec<String> = Vec::new();
    for path in paths {
        let result = run(&program, root, &["ls-files", "--error-unmatch", "--", path])?;
        let stderr = String::from_utf8_lossy(&result.stderr);
        if is_not_a_repository(&stderr) {
            return Err(format!("not a git repository: {root}"));
        }
        if result.status.success() {
            tracked.push(path.clone());
        } else {
            untracked.push(path.clone());
        }
    }

    if !tracked.is_empty() {
        let argv = discard_restore_argv(&tracked);
        let args: Vec<&str> = argv.iter().map(String::as_str).collect();
        let output = Command::new(&program)
            .args(&args)
            .current_dir(root)
            .output()
            .map_err(|error| format!("cannot run {program} in {root}: {error}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if is_not_a_repository(&stderr) {
                return Err(format!("not a git repository: {root}"));
            }
            return Err(operation_error("git discard", &stderr));
        }
    }

    if !untracked.is_empty() {
        let argv = discard_clean_argv(&untracked);
        let args: Vec<&str> = argv.iter().map(String::as_str).collect();
        let output = Command::new(&program)
            .args(&args)
            .current_dir(root)
            .output()
            .map_err(|error| format!("cannot run {program} in {root}: {error}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if is_not_a_repository(&stderr) {
                return Err(format!("not a git repository: {root}"));
            }
            return Err(operation_error("git discard", &stderr));
        }
    }

    Ok(())
}
