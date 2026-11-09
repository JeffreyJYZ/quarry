#![allow(unused_imports)]

//! The settings write itself: it must replace the file, never rewrite it in place.
//!
//! `fs::write` truncates first, so an interrupted write leaves an empty or half-written settings file
//! and the next launch silently starts from defaults. These tests pin the shape that avoids it.

pub use serde::{Deserialize, Serialize};
pub use std::fs;
pub use std::path::PathBuf;
pub use tauri::{AppHandle, Manager};

use super::*;

#[cfg(test)]
mod tests_write_atomic {
    use super::*;

    fn fixture(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "quarry-settings-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create fixture");
        dir
    }

    #[test]
    fn a_written_file_reads_back_byte_for_byte() {
        let dir = fixture("roundtrip");
        let path = dir.join("settings.json");
        write_atomic(&path, "{\n  \"a\": 1\n}\n").expect("write");
        assert_eq!(
            fs::read_to_string(&path).expect("read"),
            "{\n  \"a\": 1\n}\n"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_temporary_file_is_left_behind() {
        let dir = fixture("cleanup");
        let path = dir.join("settings.json");
        write_atomic(&path, "{}").expect("write");
        let left: Vec<String> = fs::read_dir(&dir)
            .expect("list")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(left, vec!["settings.json".to_string()]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_failed_replace_removes_its_temporary_file() {
        let dir = fixture("failed");
        // A directory cannot be replaced by a rename, so the write fails after the temp file exists.
        let path = dir.join("settings.json");
        fs::create_dir_all(&path).expect("dir in the way");
        let error = write_atomic(&path, "{}").expect_err("a directory cannot be replaced");
        assert!(
            error.contains("cannot replace"),
            "unexpected error: {error}"
        );
        assert!(!dir.join("settings.json.tmp").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    /// The regression: `fs::write` keeps the inode because it writes into the existing file. A
    /// replace-by-rename gives the name a new inode, which is what makes a crash leave the old file.
    #[cfg(unix)]
    #[test]
    fn the_file_is_replaced_rather_than_rewritten_in_place() {
        use std::os::unix::fs::MetadataExt;

        let dir = fixture("inode");
        let path = dir.join("settings.json");
        write_atomic(&path, "{\"a\":1}").expect("first write");
        let before = fs::metadata(&path).expect("metadata").ino();
        write_atomic(&path, "{\"a\":2}").expect("second write");
        let after = fs::metadata(&path).expect("metadata").ino();
        assert_ne!(
            before, after,
            "the file was rewritten in place, not replaced"
        );
        let _ = fs::remove_dir_all(&dir);
    }
}
