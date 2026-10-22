//! Filesystem reads for the project tree.
//!
//! Unit U2 owns the body of this file. Contract: list exactly one directory level, never recurse,
//! never follow symlinked directories, directories first then files, case-insensitive by name.

use crate::types::FileEntry;
use std::path::Path;

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    // STUB: U2 replaces this with a real read_dir implementation.
    let directory = Path::new(&path);
    if !directory.is_dir() {
        return Err(format!("not a directory: {path}"));
    }
    Ok(Vec::new())
}
