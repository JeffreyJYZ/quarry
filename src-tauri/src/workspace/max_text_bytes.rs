#![allow(unused_imports)]

pub(crate) use crate::ignore;
pub(crate) use crate::types::FileEntry;
pub use std::fs;
pub use std::fs::OpenOptions;
pub use std::io::Write;
#[cfg(unix)]
pub use std::os::unix::fs::PermissionsExt;
pub use std::path::Path;
pub use std::sync::atomic::{AtomicU64, Ordering};

use super::*;

/// Files above this size are not opened in the editor.
pub const MAX_TEXT_BYTES: u64 = 2 * 1024 * 1024;

/// Mode of a file this module creates: owner read/write, everyone else read.
pub const NEW_FILE_MODE: u32 = 0o644;

/// Distinguishes concurrent writes of the same target inside one process.
pub static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let directory = Path::new(&path)
        .canonicalize()
        .map_err(|error| format!("cannot list {path}: {error}"))?;
    if !directory.is_dir() {
        return Err(format!("not a directory: {path}"));
    }

    let read = fs::read_dir(&directory).map_err(|error| format!("cannot list {path}: {error}"))?;
    let mut entries = Vec::new();

    for entry in read {
        let entry = entry.map_err(|error| format!("cannot list {path}: {error}"))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if ignore::is_dir(name.as_str()) || ignore::is_file(name.as_str()) {
            continue;
        }

        let entry_path = directory.join(&name);
        // `symlink_metadata` never follows the link, so a symlinked directory is reported as a file
        // and can never be expanded into a loop.
        let metadata = fs::symlink_metadata(&entry_path)
            .map_err(|error| format!("cannot stat {}: {error}", entry_path.display()))?;

        entries.push(FileEntry {
            name,
            path: entry_path.to_string_lossy().into_owned(),
            is_dir: metadata.is_dir(),
        });
    }

    // Directories first, then case-insensitive by name; the original name keeps the order total.
    entries
        .sort_by_cached_key(|entry| (!entry.is_dir, entry.name.to_lowercase(), entry.name.clone()));

    Ok(entries)
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let file = Path::new(&path);
    let metadata = fs::metadata(file).map_err(|error| format!("cannot read {path}: {error}"))?;
    if !metadata.is_file() {
        return Err(format!("not a file: {path}"));
    }
    if metadata.len() > MAX_TEXT_BYTES {
        return Err(format!(
            "cannot read {path}: {} bytes exceeds the {MAX_TEXT_BYTES} byte limit",
            metadata.len()
        ));
    }

    let bytes = fs::read(file).map_err(|error| format!("cannot read {path}: {error}"))?;
    String::from_utf8(bytes).map_err(|_| format!("cannot read {path}: not valid UTF-8"))
}
