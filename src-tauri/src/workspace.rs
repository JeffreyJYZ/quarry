//! Filesystem reads and writes for the project tree and the editor.
//!
//! Lists exactly one directory level, never recurses, never follows symlinked directories,
//! directories first then files, case-insensitive by name. Reads a file as UTF-8 text, refusing
//! anything above the size cap. Writes a file through a sibling temporary file and a rename, so a
//! half-written file is never visible.

use crate::types::FileEntry;
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

/// Files above this size are not opened in the editor.
pub const MAX_TEXT_BYTES: u64 = 2 * 1024 * 1024;

/// Mode of a file this module creates: owner read/write, everyone else read.
pub const NEW_FILE_MODE: u32 = 0o644;

/// Distinguishes concurrent writes of the same target inside one process.
static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

use crate::ignore;

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

/// Writes one UTF-8 file atomically: write a sibling temporary file, then rename over the target.
///
/// The temporary file lives in the target's own directory, so the rename never crosses a
/// filesystem. Existing unix permissions are kept; a new file is created `0o644`. Parent
/// directories are never created, and no temporary file survives any outcome.
#[tauri::command]
pub fn write_text_file(path: String, text: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.is_absolute() {
        return Err(format!("cannot write {path}: not an absolute path"));
    }
    let size = text.len() as u64;
    if size > MAX_TEXT_BYTES {
        return Err(format!(
            "cannot write {path}: {size} bytes exceeds the {MAX_TEXT_BYTES} byte limit"
        ));
    }

    let mode = match fs::metadata(target) {
        Ok(metadata) => {
            if metadata.is_dir() {
                return Err(format!("not a file: {path}"));
            }
            #[cfg(unix)]
            {
                metadata.permissions().mode() & 0o777
            }
            #[cfg(not(unix))]
            {
                NEW_FILE_MODE
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => NEW_FILE_MODE,
        Err(error) => return Err(format!("cannot write {path}: {error}")),
    };

    let parent = target
        .parent()
        .ok_or_else(|| format!("cannot write {path}: no directory"))?;
    if !parent.is_dir() {
        return Err(format!(
            "cannot write {path}: missing directory {}",
            parent.display()
        ));
    }
    let name = target
        .file_name()
        .ok_or_else(|| format!("cannot write {path}: no file name"))?;

    let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let temp = parent.join(format!(
        "{}.{}.{counter}.tmp",
        name.to_string_lossy(),
        std::process::id()
    ));

    let written = fill_temp_file(&temp, &text, mode)
        .and_then(|()| fs::rename(&temp, target).map_err(|error| error.to_string()));
    if let Err(error) = written {
        let _ = fs::remove_file(&temp);
        return Err(format!("cannot write {path}: {error}"));
    }
    Ok(())
}

/// Creates `temp` exclusively, writes the bytes, flushes them to disk and applies `mode`.
fn fill_temp_file(temp: &Path, text: &str, mode: u32) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(temp)
        .map_err(|error| error.to_string())?;
    file.write_all(text.as_bytes())
        .map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    #[cfg(unix)]
    fs::set_permissions(temp, fs::Permissions::from_mode(mode)).map_err(|error| error.to_string())?;
    #[cfg(not(unix))]
    let _ = mode;
    Ok(())
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

        /// Absolute path of `name` inside the fixture, as the command takes it.
        fn path(&self, name: &str) -> String {
            self.path.join(name).to_string_lossy().into_owned()
        }
    }

    /// Unix permission bits of a path, without the file type.
    fn mode(path: &Path) -> u32 {
        fs::metadata(path)
            .expect("stat fixture path")
            .permissions()
            .mode()
            & 0o777
    }

    /// Names of any temporary siblings a write may have left behind.
    fn temp_siblings(directory: &Path) -> Vec<String> {
        fs::read_dir(directory)
            .expect("read fixture directory")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.ends_with(".tmp"))
            .collect()
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

    #[test]
    fn write_creates_a_new_file_with_default_mode_and_exact_bytes() {
        let fixture = Fixture::new("write-new");
        let target = fixture.path.join("fresh.txt");

        write_text_file(fixture.path("fresh.txt"), "one\ntwo\n".to_string()).expect("write file");

        assert_eq!(
            fs::read_to_string(&target).expect("read back"),
            "one\ntwo\n"
        );
        assert_eq!(mode(&target), NEW_FILE_MODE);
        assert!(temp_siblings(&fixture.path).is_empty());
    }

    #[test]
    fn overwrite_keeps_the_existing_mode() {
        let fixture = Fixture::new("write-keep-mode");
        let target = fixture.path.join("kept.txt");
        fixture.file("kept.txt", "before\n");
        fs::set_permissions(&target, fs::Permissions::from_mode(0o600)).expect("set fixture mode");

        write_text_file(fixture.path("kept.txt"), "after\n".to_string()).expect("write file");

        assert_eq!(fs::read_to_string(&target).expect("read back"), "after\n");
        assert_eq!(mode(&target), 0o600);
        assert!(temp_siblings(&fixture.path).is_empty());
    }

    #[test]
    fn a_directory_target_is_rejected() {
        let fixture = Fixture::new("write-directory");
        fixture.dir("nested");

        let error = write_text_file(fixture.path("nested"), "text".to_string())
            .expect_err("directory must be refused");

        assert!(error.contains("nested"), "unexpected error: {error}");
        assert!(fixture.path.join("nested").is_dir());
        assert!(temp_siblings(&fixture.path).is_empty());
    }

    #[test]
    fn a_missing_parent_is_rejected() {
        let fixture = Fixture::new("write-missing-parent");

        let error = write_text_file(fixture.path("absent/file.txt"), "text".to_string())
            .expect_err("missing parent must be refused");

        assert!(error.contains("absent"), "unexpected error: {error}");
        assert!(!fixture.path.join("absent").exists(), "parent was created");
        assert!(temp_siblings(&fixture.path).is_empty());
    }

    #[test]
    fn a_relative_path_is_rejected() {
        let fixture = Fixture::new("write-relative");

        let error = write_text_file("relative.txt".to_string(), "text".to_string())
            .expect_err("relative path must be refused");

        assert!(error.contains("relative.txt"), "unexpected error: {error}");
        assert!(!fixture.path.join("relative.txt").exists());
    }

    #[test]
    fn oversized_text_is_rejected_before_anything_is_created() {
        let fixture = Fixture::new("write-oversized");
        let text = "x".repeat(MAX_TEXT_BYTES as usize + 1);

        let error = write_text_file(fixture.path("big.txt"), text).expect_err("must be refused");

        assert!(
            error.contains(&MAX_TEXT_BYTES.to_string()),
            "unexpected error: {error}"
        );
        assert!(!fixture.path.join("big.txt").exists(), "target was created");
        assert!(temp_siblings(&fixture.path).is_empty());
    }

    #[test]
    fn a_failed_write_leaves_no_temporary_sibling() {
        let fixture = Fixture::new("write-failure");
        // A name past the filesystem's limit fails while creating the temporary file.
        let target = fixture.path.join("x".repeat(300));

        let error = write_text_file(target.to_string_lossy().into_owned(), "text".to_string())
            .expect_err("must fail");

        assert!(error.contains("xxxx"), "unexpected error: {error}");
        assert!(temp_siblings(&fixture.path).is_empty());
    }
}
