#![allow(unused_imports)]

use super::*;

#[cfg(test)]
pub mod containment_tests {
    use super::*;

    use std::collections::HashSet;
    use std::env;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    /// Throwaway directory under the system temp dir, removed on drop.
    pub struct Fixture {
        pub(crate) path: PathBuf,
    }

    impl Fixture {
        pub(crate) fn new(label: &str) -> Self {
            let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = env::temp_dir().join(format!(
                "quarry-roots-{label}-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create fixture directory");
            Self { path }
        }

        pub(crate) fn dir(&self, name: &str) -> PathBuf {
            let path = self.path.join(name);
            fs::create_dir_all(&path).expect("create fixture directory");
            path
        }

        pub(crate) fn file(&self, name: &str, contents: &str) -> PathBuf {
            let path = self.path.join(name);
            fs::write(&path, contents).expect("write fixture file");
            path
        }

        pub(crate) fn canonical(&self) -> PathBuf {
            self.path.canonicalize().expect("canonicalize fixture")
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    /// A registry holding exactly one canonical root.
    fn registry(root: &Path) -> HashSet<PathBuf> {
        let mut set = HashSet::new();
        set.insert(root.canonicalize().expect("canonicalize root"));
        set
    }

    #[test]
    pub fn a_path_inside_a_root_is_accepted() {
        let fixture = Fixture::new("inside");
        let root = fixture.canonical();
        let file = fixture.file("main.rs", "fn main() {}\n");
        let new_file = fixture.path.join("fresh.rs");
        let roots = registry(&root);

        assert!(contained_in(&roots, &file).is_ok());
        assert!(contained_in(&roots, &new_file).is_ok());
        assert!(contained_in(&roots, &root).is_ok());
    }

    #[test]
    pub fn a_path_outside_every_root_is_rejected() {
        let inside = Fixture::new("outside-root");
        let outside = Fixture::new("outside-target");
        let target = outside.file("secret.txt", "secret\n");
        let roots = registry(&inside.canonical());

        let error = contained_in(&roots, &target).expect_err("outside path must be refused");

        assert!(error.contains(target.to_string_lossy().as_ref()), "{error}");
        assert!(error.contains("outside every open project"), "{error}");
    }

    #[test]
    pub fn a_sibling_sharing_a_name_prefix_is_rejected() {
        let parent = Fixture::new("prefix");
        let root = parent.dir("proj");
        let sibling = parent.dir("proj-other");
        let target = sibling.join("escaped.txt");
        fs::write(&target, "escaped\n").expect("write sibling file");

        let error =
            contained_in(&registry(&root), &target).expect_err("prefix sibling must be refused");

        assert!(error.contains("outside every open project"), "{error}");
    }

    #[cfg(unix)]
    #[test]
    pub fn a_symlink_pointing_outside_is_rejected() {
        let fixture = Fixture::new("symlink");
        let root = fixture.dir("proj");
        let outside = fixture.dir("elsewhere");
        let secret = outside.join("secret.txt");
        fs::write(&secret, "secret\n").expect("write outside file");
        std::os::unix::fs::symlink(&outside, root.join("escape")).expect("create symlink");
        let link = root.join("escape").join("secret.txt");
        let roots = registry(&root);

        let error = contained_in(&roots, &link).expect_err("symlinked escape must be refused");

        assert!(error.contains("outside every open project"), "{error}");
    }

    #[test]
    pub fn an_empty_registry_accepts_anything() {
        let _guard = crate::test_support::path_lock();
        clear_roots();
        let anywhere = Path::new("/quarry-no-such-project/notes.txt");

        contained(anywhere).expect("an empty registry is unrestricted");
    }

    #[test]
    pub fn registering_a_root_accepts_a_write_inside_it() {
        // The registry is process-wide, so the root registered here is the system temp directory:
        // every other test in flight writes inside it and keeps passing while this runs.
        let _guard = crate::test_support::path_lock();
        let fixture = Fixture::new("write");
        let target = fixture.path.join("written.txt");
        register_root(&env::temp_dir());

        write_text_file(
            target.to_string_lossy().into_owned(),
            "inside\n".to_string(),
            None,
        )
        .expect("a write inside an open project is allowed");

        assert_eq!(fs::read_to_string(&target).expect("read back"), "inside\n");
        clear_roots();
    }
}
