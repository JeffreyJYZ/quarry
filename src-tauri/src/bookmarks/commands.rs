#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::model::{Bookmark, BookmarkEntry};
use super::store::{
    absolute_path, existing_root, read_entries, relative_path, rows_for, write_entries,
};

/// Every bookmark in the project, grouped by the window rather than here.
///
/// An entry whose file was deleted, or whose bytes are not text, is dropped instead of reported:
/// a stale bookmark is not something the user can act on from a dialog.
#[tauri::command]
pub fn list_bookmarks(root: String) -> Result<Vec<Bookmark>, String> {
    let root = existing_root(&root)?;
    Ok(rows_for(&root, &read_entries(&root)))
}

/// Adds the bookmark when it is absent and removes it when it is present.
#[tauri::command]
pub fn toggle_bookmark(root: String, path: String, line: u32) -> Result<Vec<Bookmark>, String> {
    if line == 0 {
        return Err("a bookmark line is 1-based, so 0 does not exist.".to_string());
    }
    let root = existing_root(&root)?;
    let relative = relative_path(&root, &path)?;
    let mut entries = read_entries(&root);
    let existing = entries
        .iter()
        .position(|entry| entry.path == relative && entry.line == line);
    match existing {
        Some(index) => {
            entries.remove(index);
        }
        None => entries.push(BookmarkEntry {
            path: relative,
            line,
        }),
    }
    write_entries(&root, &entries)?;
    Ok(rows_for(&root, &entries))
}

/// Forgets every bookmark in the project, leaving an empty file behind.
#[tauri::command]
pub fn clear_bookmarks(root: String) -> Result<(), String> {
    let root = existing_root(&root)?;
    write_entries(&root, &[])
}
