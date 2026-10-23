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

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_2 {
    use super::*;

    use std::env;

    use std::path::PathBuf;

    use std::sync::atomic::{AtomicU64, Ordering};

    pub static COUNTER: AtomicU64 = AtomicU64::new(0);

    /// Throwaway directory under the system temp dir, removed on drop.
    pub struct Fixture {
        pub(crate) path: PathBuf,
    }

    impl Fixture {
        pub(crate) fn new(label: &str) -> Self {
            let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = env::temp_dir().join(format!(
                "quarry-workspace-{label}-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create fixture directory");
            Self { path }
        }

        pub(crate) fn dir(&self, name: &str) {
            fs::create_dir_all(self.path.join(name)).expect("create fixture directory");
        }

        pub(crate) fn file(&self, name: &str, contents: &str) {
            fs::write(self.path.join(name), contents).expect("write fixture file");
        }

        /// Absolute path of `name` inside the fixture, as the command takes it.
        pub(crate) fn path(&self, name: &str) -> String {
            self.path.join(name).to_string_lossy().into_owned()
        }
    }

    /// Unix permission bits of a path, without the file type.
    pub fn mode(path: &Path) -> u32 {
        fs::metadata(path)
            .expect("stat fixture path")
            .permissions()
            .mode()
            & 0o777
    }

    /// Names of any temporary siblings a write may have left behind.
    pub fn temp_siblings(directory: &Path) -> Vec<String> {
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
    pub fn a_directory_target_is_rejected() {
        let fixture = Fixture::new("write-directory");
        fixture.dir("nested");

        let error = write_text_file(fixture.path("nested"), "text".to_string())
            .expect_err("directory must be refused");

        assert!(error.contains("nested"), "unexpected error: {error}");
        assert!(fixture.path.join("nested").is_dir());
        assert!(temp_siblings(&fixture.path).is_empty());
    }

    #[test]
    pub fn a_missing_parent_is_rejected() {
        let fixture = Fixture::new("write-missing-parent");

        let error = write_text_file(fixture.path("absent/file.txt"), "text".to_string())
            .expect_err("missing parent must be refused");

        assert!(error.contains("absent"), "unexpected error: {error}");
        assert!(!fixture.path.join("absent").exists(), "parent was created");
        assert!(temp_siblings(&fixture.path).is_empty());
    }

    #[test]
    pub fn a_relative_path_is_rejected() {
        let fixture = Fixture::new("write-relative");

        let error = write_text_file("relative.txt".to_string(), "text".to_string())
            .expect_err("relative path must be refused");

        assert!(error.contains("relative.txt"), "unexpected error: {error}");
        assert!(!fixture.path.join("relative.txt").exists());
    }

    #[test]
    pub fn oversized_text_is_rejected_before_anything_is_created() {
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
    pub fn a_failed_write_leaves_no_temporary_sibling() {
        let fixture = Fixture::new("write-failure");
        // A name past the filesystem's limit fails while creating the temporary file.
        let target = fixture.path.join("x".repeat(300));

        let error = write_text_file(target.to_string_lossy().into_owned(), "text".to_string())
            .expect_err("must fail");

        assert!(error.contains("xxxx"), "unexpected error: {error}");
        assert!(temp_siblings(&fixture.path).is_empty());
    }
}
