#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::env;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    struct Fixture {
        path: PathBuf,
    }

    impl Fixture {
        fn new(label: &str) -> Self {
            let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = env::temp_dir().join(format!(
                "quarry-freshness-{label}-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create fixture directory");
            Self { path }
        }

        fn write(&self, name: &str, contents: &str) {
            let target = self.path.join(name);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).expect("create fixture parent");
            }
            fs::write(target, contents).expect("write fixture file");
        }

        fn root(&self) -> PathBuf {
            self.path.canonicalize().expect("canonicalize fixture")
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn a_marker_is_a_cmake_lists_or_a_preset_file() {
        assert!(is_configure_marker(Path::new("/p/CMakeLists.txt")));
        assert!(is_configure_marker(Path::new("/p/CMakePresets.json")));
        assert!(!is_configure_marker(Path::new("/p/src/main.cpp")));
        assert!(!is_configure_marker(Path::new("/p/build/CMakeCache.txt")));
    }

    #[test]
    fn a_database_older_than_a_marker_is_stale() {
        let fixture = Fixture::new("stale");
        fixture.write("build/compile_commands.json", "[]");
        fixture.write("include/demo/header.hpp", "");
        let build = fixture.root().join("build");
        assert!(!database_is_stale(&build, &fixture.root()));

        std::thread::sleep(std::time::Duration::from_millis(20));
        fixture.write("CMakeLists.txt", "project(demo)\n");
        assert!(database_is_stale(&build, &fixture.root()));
        assert!(
            configure_markers(&fixture.root()).contains(&fixture.root().join("CMakeLists.txt"))
        );
    }

    #[test]
    fn a_missing_database_is_always_stale() {
        let fixture = Fixture::new("missing");
        assert!(database_is_stale(
            &fixture.root().join("build"),
            &fixture.root()
        ));
    }

    #[test]
    fn a_nested_manifest_counts_as_a_marker() {
        let fixture = Fixture::new("nested");
        fixture.write("lib/CMakeLists.txt", "add_library(lib STATIC lib.cpp)\n");
        assert!(
            configure_markers(&fixture.root()).contains(&fixture.root().join("lib/CMakeLists.txt"))
        );
    }

    #[test]
    fn the_build_type_is_only_set_for_a_fresh_directory() {
        let fixture = Fixture::new("argv");
        let build = fixture.root().join("build");
        let fresh = argv(&fixture.root(), &build);
        assert!(
            fresh
                .iter()
                .any(|arg| arg == "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON")
        );
        assert!(
            fresh
                .iter()
                .any(|arg| arg.starts_with("-DCMAKE_BUILD_TYPE="))
        );

        fs::create_dir_all(&build).expect("create build directory");
        fixture.write("build/CMakeCache.txt", "");
        let existing = argv(&fixture.root(), &build);
        assert!(
            !existing
                .iter()
                .any(|arg| arg.starts_with("-DCMAKE_BUILD_TYPE=")),
            "reconfiguring an existing tree must not flip its build type"
        );
    }
}
