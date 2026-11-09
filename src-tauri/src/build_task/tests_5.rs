#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::time::{Duration, SystemTime};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_5 {
    use super::*;
    use crate::test_support::TempDir;
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    fn write_executable(path: &Path) {
        fs::create_dir_all(path.parent().expect("parent")).expect("mkdir");
        fs::write(path, b"#!/bin/sh\n").expect("write");
        #[cfg(unix)]
        fs::set_permissions(path, fs::Permissions::from_mode(0o755)).expect("chmod");
    }

    fn write_plain(path: &Path) {
        fs::create_dir_all(path.parent().expect("parent")).expect("mkdir");
        fs::write(path, b"not a program").expect("write");
    }

    #[test]
    pub fn the_newest_executable_written_by_the_build_wins() {
        let directory = TempDir::new("newest-exec");
        let root = directory.path();
        let since = SystemTime::now() - Duration::from_secs(60);

        write_executable(&root.join("old/demo"));
        std::thread::sleep(Duration::from_millis(20));
        write_executable(&root.join("demo"));

        assert_eq!(
            cmake_artifact("", root, since).as_deref(),
            Some(root.join("demo").to_string_lossy().as_ref())
        );
    }

    #[test]
    pub fn a_file_the_build_did_not_touch_is_not_reported() {
        let directory = TempDir::new("newest-stale");
        let root = directory.path();
        write_executable(&root.join("demo"));

        // Everything on disk predates this build, so the build produced nothing to launch.
        let since = SystemTime::now() + Duration::from_secs(5);
        assert_eq!(cmake_artifact("", root, since), None);
    }

    #[test]
    pub fn build_internals_libraries_and_objects_are_skipped() {
        let directory = TempDir::new("newest-skip");
        let root = directory.path();
        let since = SystemTime::now() - Duration::from_secs(60);

        write_executable(&root.join("CMakeFiles/demo.dir/main.c.o"));
        write_executable(&root.join("libdemo.dylib"));
        write_plain(&root.join("notes.txt"));

        assert_eq!(cmake_artifact("", root, since), None);

        write_executable(&root.join("demo"));
        assert_eq!(
            cmake_artifact("", root, since).as_deref(),
            Some(root.join("demo").to_string_lossy().as_ref())
        );
    }

    #[test]
    pub fn a_newer_artifact_does_not_take_the_launch_from_the_reported_target() {
        let directory = TempDir::new("newest-helper");
        let root = directory.path();
        let since = SystemTime::now() - Duration::from_secs(60);

        write_executable(&root.join("demo"));
        std::thread::sleep(Duration::from_millis(20));
        write_executable(&root.join("demo_test"));

        // The old answer: the newest file the build wrote, here the test binary.
        assert_eq!(
            cmake_artifact("", root, since).as_deref(),
            Some(root.join("demo_test").to_string_lossy().as_ref())
        );
        // The answer Run launches: what the build reported, even though it is the older file.
        assert_eq!(
            cmake_artifact("Built target demo\n", root, since).as_deref(),
            Some(root.join("demo").to_string_lossy().as_ref())
        );
    }

    #[test]
    pub fn a_test_binary_under_deps_is_never_the_program() {
        let directory = TempDir::new("newest-deps");
        let root = directory.path();
        let since = SystemTime::now() - Duration::from_secs(60);

        let app = root.join("target/debug/demo");
        write_executable(&app);
        std::thread::sleep(Duration::from_millis(20));
        // Cargo links every unit into `deps/`, so a build that also compiled tests leaves a newer
        // extensionless binary there, and it is the app's own name that a walk would rank first.
        let test_binary = root.join("target/debug/deps/demo-4f9c1b2a");
        write_executable(&test_binary);

        assert!(test_binary.exists(), "the walk's depth limit must reach it");
        assert_eq!(
            cmake_artifact("", root, since).as_deref(),
            Some(app.to_string_lossy().as_ref())
        );
        assert!(
            executable_candidates(root)
                .iter()
                .all(|candidate| !candidate.path.starts_with(root.join("target/debug/deps"))),
            "a binary under deps is not a candidate at all"
        );
    }

    #[test]
    pub fn a_missing_directory_reports_nothing_instead_of_failing() {
        let directory = TempDir::new("newest-missing");
        let missing = directory.path().join("never-built");
        assert_eq!(cmake_artifact("", &missing, SystemTime::UNIX_EPOCH), None);
    }
}
