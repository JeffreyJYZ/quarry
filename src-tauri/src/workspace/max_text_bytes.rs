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

/// Largest document this app sends to a language server.
///
/// This is the editor's load cap, not a second number: text the editor refuses to open is text
/// nothing can synchronise, so a larger value here would only allow payloads no file could produce.
/// A document exactly at the cap is still sent; one byte more is refused, naming both sizes.
pub const MAX_LSP_DOCUMENT_BYTES: usize = MAX_TEXT_BYTES as usize;

/// Mode of a file this module creates: owner read/write, everyone else read.
pub const NEW_FILE_MODE: u32 = 0o644;

/// Distinguishes concurrent writes of the same target inside one process.
pub static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    contained(Path::new(&path))?;
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

/// One file as text, plus the encoding it must be written back as.
///
/// The decoding order is UTF-8 behind a mark, UTF-16 by its mark, plain UTF-8, then GB18030 — the
/// superset of GBK that most non-UTF-8 Chinese sources are in — and nothing else is guessed at.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<TextFile, String> {
    contained(Path::new(&path))?;
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
    let (text, encoding) =
        decode_text(&bytes).map_err(|reason| format!("cannot read {path}: {reason}"))?;
    Ok(TextFile {
        text,
        encoding: encoding.label(),
    })
}
