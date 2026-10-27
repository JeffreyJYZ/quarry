#![allow(unused_imports)]

pub(crate) use crate::types::{ProjectInfo, ProjectKind};
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::env;
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
                "quarry-descend-{label}-{}-{unique}",
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

        /// Canonical path, which is what `open_project` reports on macOS (temp dir is a symlink).
        fn root(&self) -> PathBuf {
            self.path.canonicalize().expect("canonicalize fixture")
        }

        fn open(&self) -> ProjectInfo {
            open_project(self.root().to_string_lossy().into_owned()).expect("open project")
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn cargo_package(name: &str) -> String {
        format!("[package]\nname = \"{name}\"\nversion = \"0.1.0\"\n")
    }

    #[test]
    fn a_crate_one_level_down_is_detected() {
        let fixture = Fixture::new("one-level");
        fixture.write("src-tauri/Cargo.toml", &cargo_package("one-down"));
        let expected = fixture.root().join("src-tauri");

        let info = fixture.open();

        assert_eq!(info.kind, ProjectKind::Cargo);
        assert_eq!(info.name, "one-down");
        assert_eq!(Path::new(&info.build_root), expected);
    }

    #[test]
    fn a_crate_two_levels_down_is_detected() {
        let fixture = Fixture::new("two-levels");
        fixture.write("crates/inner/Cargo.toml", &cargo_package("two-down"));
        let expected = fixture.root().join("crates/inner");

        let info = fixture.open();

        assert_eq!(info.kind, ProjectKind::Cargo);
        assert_eq!(info.name, "two-down");
        assert_eq!(Path::new(&info.build_root), expected);
    }

    #[test]
    fn build_output_directories_are_never_searched() {
        let fixture = Fixture::new("skipped");
        fixture.write("target/Cargo.toml", &cargo_package("from-target"));
        fixture.write("node_modules/Cargo.toml", &cargo_package("from-modules"));
        fixture.write("build/Cargo.toml", &cargo_package("from-build"));
        let root = fixture.root();

        let info = fixture.open();

        assert_eq!(info.kind, ProjectKind::Unknown);
        assert_eq!(Path::new(&info.build_root), root);
    }

    #[test]
    fn two_crates_at_the_same_depth_stay_unknown() {
        let fixture = Fixture::new("ambiguous");
        fixture.write("alpha/Cargo.toml", &cargo_package("alpha"));
        fixture.write("beta/Cargo.toml", &cargo_package("beta"));
        let root = fixture.root();

        let info = fixture.open();

        assert_eq!(info.kind, ProjectKind::Unknown);
        assert_eq!(Path::new(&info.build_root), root);
    }

    #[test]
    fn a_root_manifest_still_wins_over_anything_below_it() {
        let fixture = Fixture::new("root-wins");
        fixture.write("Cargo.toml", &cargo_package("at-root"));
        fixture.write("crates/inner/Cargo.toml", &cargo_package("inner"));
        let root = fixture.root();

        let info = fixture.open();

        assert_eq!(info.kind, ProjectKind::Cargo);
        assert_eq!(info.name, "at-root");
        assert_eq!(Path::new(&info.build_root), root);
    }
}
