//! Filesystem reads for the project tree and the editor.
//!
//! Lists exactly one directory level, never recurses, never follows symlinked directories,
//! directories first then files, case-insensitive by name. Reads a file as UTF-8 text, refusing
//! anything above the size cap.

use crate::types::FileEntry;
use std::fs;
use std::path::Path;

/// Files above this size are not opened in the editor.
pub const MAX_TEXT_BYTES: u64 = 2 * 1024 * 1024;

/// macOS metadata, never useful in the tree.
const IGNORED_NAMES: [&str; 1] = [".DS_Store"];

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
        if IGNORED_NAMES.contains(&name.as_str()) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    /// Throwaway directory under the system temp dir, removed on drop.
    struct Fixture {
        path: PathBuf,
    }

    impl Fixture {
        fn new(label: &str) -> Self {
            let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = env::temp_dir().join(format!(
                "quarry-workspace-{label}-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create fixture directory");
            Self { path }
        }

        fn dir(&self, name: &str) {
            fs::create_dir_all(self.path.join(name)).expect("create fixture directory");
        }

        fn file(&self, name: &str, contents: &str) {
            fs::write(self.path.join(name), contents).expect("write fixture file");
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn list_dir_puts_directories_first_and_skips_ds_store() {
        let fixture = Fixture::new("list");
        fixture.dir("zebra");
        fixture.dir("Alpha");
        fixture.file("b.txt", "b");
        fixture.file("A.txt", "a");
        fixture.file(".hidden", "dot");
        fixture.file(".DS_Store", "junk");

        let root = fixture.path.canonicalize().expect("canonicalize fixture");
        let entries = list_dir(root.to_string_lossy().into_owned()).expect("list dir");

        let names: Vec<&str> = entries.iter().map(|entry| entry.name.as_str()).collect();
        assert_eq!(names, vec!["Alpha", "zebra", ".hidden", "A.txt", "b.txt"]);
        assert!(!names.contains(&".DS_Store"));

        let flags: Vec<bool> = entries.iter().map(|entry| entry.is_dir).collect();
        assert_eq!(flags, vec![true, true, false, false, false]);

        for entry in &entries {
            assert!(
                Path::new(&entry.path).is_absolute(),
                "entry path is not absolute: {}",
                entry.path
            );
            assert_eq!(Path::new(&entry.path).parent(), Some(root.as_path()));
        }
    }
}
