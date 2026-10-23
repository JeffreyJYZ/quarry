#![allow(unused_imports)]

use super::*;

#[cfg(test)]
pub mod workspace_tests {
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
    pub fn list_dir_puts_directories_first_and_skips_ds_store() {
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
    pub fn write_creates_a_new_file_with_default_mode_and_exact_bytes() {
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
    pub fn overwrite_keeps_the_existing_mode() {
        let fixture = Fixture::new("write-keep-mode");
        let target = fixture.path.join("kept.txt");
        fixture.file("kept.txt", "before\n");
        fs::set_permissions(&target, fs::Permissions::from_mode(0o600)).expect("set fixture mode");

        write_text_file(fixture.path("kept.txt"), "after\n".to_string()).expect("write file");

        assert_eq!(fs::read_to_string(&target).expect("read back"), "after\n");
        assert_eq!(mode(&target), 0o600);
        assert!(temp_siblings(&fixture.path).is_empty());
    }
}
