//! Filesystem reads for the project tree and the editor.
//!
//! Unit U2 owns the body of this file. Contract: list exactly one directory level, never recurse,
//! never follow symlinked directories, directories first then files, case-insensitive by name. Read a
//! file as UTF-8 text, refusing anything above the size cap.

use crate::types::FileEntry;
use std::path::Path;

/// Files above this size are not opened in the editor.
pub const MAX_TEXT_BYTES: u64 = 2 * 1024 * 1024;

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    // STUB: U2 replaces this with a real read_dir implementation.
    let directory = Path::new(&path);
    if !directory.is_dir() {
        return Err(format!("not a directory: {path}"));
    }
    Ok(Vec::new())
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    // STUB: U2 replaces this.
    Err(format!("cannot read {path}: not implemented"))
}
