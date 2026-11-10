#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::model::{Bookmark, BookmarkEntry, BookmarkFile};

/// Where every project keeps its own bookmarks; the only directory a write here may create.
pub const BOOKMARKS_DIR: &str = ".quarry";

pub const BOOKMARKS_FILE: &str = "bookmarks.json";

/// The bookmarks file for one project root.
pub fn bookmarks_path(root: &Path) -> PathBuf {
    root.join(BOOKMARKS_DIR).join(BOOKMARKS_FILE)
}

/// The root as an absolute directory, or the reason it cannot be one.
pub fn existing_root(root: &str) -> Result<PathBuf, String> {
    let trimmed = root.trim();
    if trimmed.is_empty() {
        return Err("the project root is empty.".to_string());
    }
    let path = Path::new(trimmed);
    if !path.is_absolute() {
        return Err(format!("root must be an absolute path: {root}"));
    }
    if !path.is_dir() {
        return Err(format!("directory does not exist: {root}"));
    }
    Ok(path.to_path_buf())
}

/// `path` as a root-relative `/` path, so the file reads the same on every OS.
pub fn relative_path(root: &Path, path: &str) -> Result<String, String> {
    let target = Path::new(path);
    let relative = target
        .strip_prefix(root)
        .map_err(|_| format!("{} is not inside {}", target.display(), root.display()))?;
    let parts: Vec<String> = relative
        .components()
        .map(|part| part.as_os_str().to_string_lossy().into_owned())
        .filter(|part| !part.is_empty() && part != ".")
        .collect();
    if parts.is_empty() {
        return Err(format!(
            "{} is the project root, not a file",
            target.display()
        ));
    }
    Ok(parts.join("/"))
}

/// A stored relative path joined back onto the root in the platform's own style.
pub fn absolute_path(root: &Path, relative: &str) -> PathBuf {
    relative
        .split('/')
        .filter(|part| !part.is_empty() && *part != ".")
        .fold(root.to_path_buf(), |path, part| path.join(part))
}

/// Strips what a gutter cannot draw, then sorts and deduplicates, so the file is stable.
pub fn normalize_entries(entries: Vec<BookmarkEntry>) -> Vec<BookmarkEntry> {
    let mut kept: Vec<BookmarkEntry> = entries
        .into_iter()
        .filter(BookmarkEntry::is_valid)
        .collect();
    kept.sort_by(|left, right| left.path.cmp(&right.path).then(left.line.cmp(&right.line)));
    kept.dedup_by(|left, right| left.path == right.path && left.line == right.line);
    kept
}

/// Reads the stored entries; a missing, unreadable or malformed file is an empty set.
pub fn read_entries(root: &Path) -> Vec<BookmarkEntry> {
    let Ok(text) = fs::read_to_string(bookmarks_path(root)) else {
        return Vec::new();
    };
    let Ok(file) = serde_json::from_str::<BookmarkFile>(&text) else {
        return Vec::new();
    };
    normalize_entries(file.bookmarks)
}

/// Replaces the file through the crate's atomic write, creating `.quarry/` when needed.
pub fn write_entries(root: &Path, entries: &[BookmarkEntry]) -> Result<(), String> {
    let dir = root.join(BOOKMARKS_DIR);
    fs::create_dir_all(&dir)
        .map_err(|error| format!("cannot create {}: {error}", dir.display()))?;
    let file = BookmarkFile {
        bookmarks: normalize_entries(entries.to_vec()),
    };
    let mut json = serde_json::to_string_pretty(&file)
        .map_err(|error| format!("cannot serialise bookmarks: {error}"))?;
    json.push('\n');
    let path = bookmarks_path(root);
    crate::atomic_write::replace(&path, json.as_bytes())
        .map_err(|error| format!("cannot write {}: {error}", path.display()))
}

/// The window's rows: absolute paths, the line's own text, and nothing for a file that vanished.
pub fn rows_for(root: &Path, entries: &[BookmarkEntry]) -> Vec<Bookmark> {
    let mut rows = Vec::new();
    for entry in normalize_entries(entries.to_vec()) {
        let path = absolute_path(root, &entry.path);
        let Ok(text) = fs::read_to_string(&path) else {
            continue;
        };
        let line = text.lines().nth(entry.line as usize - 1).unwrap_or("");
        rows.push(Bookmark {
            path: path.display().to_string(),
            line: entry.line,
            text: line.to_string(),
        });
    }
    rows.sort_by(|left, right| left.path.cmp(&right.path).then(left.line.cmp(&right.line)));
    rows
}
