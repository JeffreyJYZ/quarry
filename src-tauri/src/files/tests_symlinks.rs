#![allow(unused_imports)]

//! Filesystem containment: a path inside the project must stay inside it once symlinks are resolved.
//!
//! Kept apart from `tests_items` because the two arrived from different findings and together push that
//! file past the 200-line limit; the subject is one thing, so the split costs nothing.

/// Directories that are never descended into (shared with the rest of the crate).
pub(crate) use crate::ignore;
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    #[test]
    fn a_symlinked_directory_cannot_be_used_to_write_outside_the_project() {
        let inside = temp_dir("symlink-inside");
        let outside = temp_dir("symlink-outside");
        symlink(&outside, inside.join("escape")).expect("create symlink");

        let error = create_file(
            inside.to_string_lossy().into_owned(),
            inside.join("escape").to_string_lossy().into_owned(),
            "planted.txt".to_string(),
        )
        .expect_err("a write through a symlink must be refused");

        assert!(error.contains("outside the project root"), "{error}");
        assert!(!outside.join("planted.txt").exists());
    }

    #[test]
    fn a_plain_nested_path_is_still_inside() {
        let project = temp_dir("plain-nested");
        fs::create_dir_all(project.join("src")).expect("create src");
        let created = create_file(
            project.to_string_lossy().into_owned(),
            project.join("src").to_string_lossy().into_owned(),
            "main.cpp".to_string(),
        )
        .expect("creating inside the project works");
        assert!(std::path::Path::new(&created).exists());
    }

    fn temp_dir(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "quarry-files-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("create fixture");
        path
    }
}
