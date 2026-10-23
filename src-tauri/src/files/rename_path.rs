#![allow(unused_imports)]

/// Directories that are never descended into (shared with the rest of the crate).
pub(crate) use crate::ignore;
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[tauri::command]
pub fn rename_path(root: String, old_path: String, new_name: String) -> Result<String, String> {
    validate_name(&new_name)?;
    let root = resolve_root(&root)?;
    let old = ensure_within(&root, Path::new(&old_path))?;
    if !old.exists() {
        return Err(format!("does not exist: {}", old.display()));
    }
    let parent = old
        .parent()
        .ok_or_else(|| "no parent directory".to_string())?;
    let target = parent.join(&new_name);
    let target = ensure_within(&root, &target)?;
    if target.exists() {
        return Err(format!("already exists: {}", target.display()));
    }
    fs::rename(&old, &target)
        .map_err(|error| format!("cannot rename {}: {error}", old.display()))?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn delete_path(root: String, path: String) -> Result<(), String> {
    let root = resolve_root(&root)?;
    let target = ensure_within(&root, Path::new(&path))?;
    if target == root {
        return Err("cannot delete the project root".to_string());
    }
    if !target.exists() {
        return Err(format!("does not exist: {}", target.display()));
    }
    if target.is_dir() {
        fs::remove_dir_all(&target)
            .map_err(|error| format!("cannot delete {}: {error}", target.display()))?;
    } else {
        fs::remove_file(&target)
            .map_err(|error| format!("cannot delete {}: {error}", target.display()))?;
    }
    Ok(())
}
