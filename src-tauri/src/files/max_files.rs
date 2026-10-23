#![allow(unused_imports)]

/// Directories that are never descended into (shared with the rest of the crate).
pub(crate) use crate::ignore;
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// Cap on returned files; the UI filters what it receives.
pub const MAX_FILES: usize = 20_000;

#[tauri::command]
pub async fn list_files(root: String) -> Result<Vec<String>, String> {
    let path = PathBuf::from(&root);
    if !path.is_dir() {
        return Err(format!("list root is not a directory: {root}"));
    }
    let root = absolute_root(&root);
    tauri::async_runtime::spawn_blocking(move || collect(&root, MAX_FILES))
        .await
        .map_err(|error| format!("list task failed: {error}"))?
}

/// Collects files under `root`, stopping once `cap` entries have been gathered.
pub fn collect(root: &Path, cap: usize) -> Result<Vec<String>, String> {
    if !root.is_dir() {
        return Err(format!("list root is not a directory: {}", root.display()));
    }
    let mut files = Vec::new();
    walk(root, &mut files, cap);
    files.sort();
    Ok(files)
}

pub fn walk(dir: &Path, files: &mut Vec<String>, cap: usize) {
    if files.len() >= cap {
        return;
    }
    let read = match fs::read_dir(dir) {
        Ok(read) => read,
        Err(_) => return,
    };
    for entry in read {
        if files.len() >= cap {
            return;
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let path = entry.path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.is_dir() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if ignore::is_dir(name.as_ref()) {
                continue;
            }
            walk(&path, files, cap);
        } else if metadata.is_file() && files.len() < cap {
            files.push(path.to_string_lossy().into_owned());
        }
    }
}

pub fn absolute_root(root: &str) -> PathBuf {
    let path = PathBuf::from(root);
    std::path::absolute(&path).unwrap_or(path)
}

pub fn resolve_root(root: &str) -> Result<PathBuf, String> {
    let root = absolute_root(root);
    if !root.is_dir() {
        return Err(format!(
            "project root is not a directory: {root}",
            root = root.display()
        ));
    }
    Ok(root)
}

pub fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("name must not be empty".to_string());
    }
    if name.contains('/') || name.contains("\\") {
        return Err("name must not contain a path separator".to_string());
    }
    if name == "." || name == ".." {
        return Err("name must not be '.' or '..'".to_string());
    }
    Ok(())
}

pub fn ensure_within(root: &Path, target: &Path) -> Result<PathBuf, String> {
    let absolute = std::path::absolute(target).unwrap_or_else(|_| target.to_path_buf());
    if !absolute.starts_with(root) {
        return Err("path is outside the project root".to_string());
    }
    Ok(absolute)
}

#[tauri::command]
pub fn create_file(root: String, parent: String, name: String) -> Result<String, String> {
    validate_name(&name)?;
    let root = resolve_root(&root)?;
    let parent = ensure_within(&root, Path::new(&parent))?;
    if !parent.is_dir() {
        return Err(format!("not a directory: {}", parent.display()));
    }
    let target = parent.join(&name);
    let target = ensure_within(&root, &target)?;
    if target.exists() {
        return Err(format!("already exists: {}", target.display()));
    }
    fs::write(&target, b"")
        .map_err(|error| format!("cannot create {}: {error}", target.display()))?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn create_dir(root: String, parent: String, name: String) -> Result<String, String> {
    validate_name(&name)?;
    let root = resolve_root(&root)?;
    let parent = ensure_within(&root, Path::new(&parent))?;
    if !parent.is_dir() {
        return Err(format!("not a directory: {}", parent.display()));
    }
    let target = parent.join(&name);
    let target = ensure_within(&root, &target)?;
    if target.exists() {
        return Err(format!("already exists: {}", target.display()));
    }
    fs::create_dir(&target)
        .map_err(|error| format!("cannot create {}: {error}", target.display()))?;
    Ok(target.to_string_lossy().into_owned())
}
