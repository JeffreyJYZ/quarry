#![allow(unused_imports)]

/// Directories that are never descended into (shared with the rest of the crate).
pub(crate) use crate::ignore;
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
pub mod file_ops_tests {
    use super::*;
    use std::env;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    struct Fixture {
        path: PathBuf,
    }

    impl Fixture {
        fn new(label: &str) -> Self {
            let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = env::temp_dir().join(format!(
                "quarry-fileops-{label}-{}-{unique}",
                std::process::id()
            ));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).expect("create fixture directory");
            Self { path }
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn separator_in_name_is_refused() {
        let fixture = Fixture::new("sep");
        let root = fixture.path.to_string_lossy().into_owned();
        let err = create_file(root.clone(), root.clone(), "a/b".to_string()).unwrap_err();
        assert!(err.contains("path separator"), "{err}");
    }

    #[test]
    fn path_outside_root_is_refused() {
        let fixture = Fixture::new("outside");
        let root = fixture.path.to_string_lossy().into_owned();
        let outside = env::temp_dir().join("elsewhere.txt");
        let err = delete_path(root.clone(), outside.to_string_lossy().into_owned()).unwrap_err();
        assert_eq!(err, "path is outside the project root");
    }

    #[test]
    fn existing_target_is_refused() {
        let fixture = Fixture::new("exists");
        let root = fixture.path.to_string_lossy().into_owned();
        fs::write(fixture.path.join("x.txt"), b"").unwrap();
        let err = create_file(root.clone(), root.clone(), "x.txt".to_string()).unwrap_err();
        assert!(err.contains("already exists"), "{err}");
    }

    #[test]
    fn create_rename_delete_round_trip() {
        let fixture = Fixture::new("roundtrip");
        let root = fixture.path.to_string_lossy().into_owned();
        let created = create_file(root.clone(), root.clone(), "a.txt".to_string()).unwrap();
        assert!(PathBuf::from(&created).exists());
        let renamed = rename_path(root.clone(), created.clone(), "b.txt".to_string()).unwrap();
        assert!(!PathBuf::from(&created).exists());
        assert!(PathBuf::from(&renamed).exists());
        delete_path(root.clone(), renamed.clone()).unwrap();
        assert!(!PathBuf::from(&renamed).exists());
    }

    #[test]
    fn deleting_missing_is_refused() {
        let fixture = Fixture::new("missing");
        let root = fixture.path.to_string_lossy().into_owned();
        let target = fixture.path.join("nope.txt");
        let err = delete_path(root, target.to_string_lossy().into_owned()).unwrap_err();
        assert!(err.contains("does not exist"), "{err}");
    }

    #[test]
    fn deleting_root_is_refused() {
        let fixture = Fixture::new("rootdel");
        let root = fixture.path.to_string_lossy().into_owned();
        let err = delete_path(root.clone(), root).unwrap_err();
        assert_eq!(err, "cannot delete the project root");
    }
}
