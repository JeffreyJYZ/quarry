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
                "quarry-project-{label}-{}-{unique}",
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
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn cargo_manifest_wins_over_cmake_in_the_same_directory() {
        let fixture = Fixture::new("priority");
        fixture.write(
            "Cargo.toml",
            "[package]\nname = \"from-cargo\"\nversion = \"0.1.0\"\n",
        );
        fixture.write("CMakeLists.txt", "project(from_cmake)\n");

        let info =
            open_project(fixture.root().to_string_lossy().into_owned()).expect("open project");

        assert_eq!(info.kind, ProjectKind::Cargo);
        assert_eq!(info.name, "from-cargo");
        assert_eq!(Path::new(&info.build_root), fixture.root());
        assert_eq!(info.launch_config, None);
    }

    #[test]
    fn name_comes_from_the_package_section_only() {
        let fixture = Fixture::new("name");
        fixture.write(
            "Cargo.toml",
            concat!(
                "[package]\n",
                "version = \"0.1.0\"\n",
                "# name = \"commented-out\"\n",
                "  name   =   \"right-name\"  \n",
                "\n",
                "[package.metadata.docs]\n",
                "name = \"wrong-metadata\"\n",
                "\n",
                "[dependencies]\n",
                "name = \"wrong-dependency\"\n",
            ),
        );

        let info =
            open_project(fixture.root().to_string_lossy().into_owned()).expect("open project");

        assert_eq!(info.kind, ProjectKind::Cargo);
        assert_eq!(info.name, "right-name");
    }

    #[test]
    fn empty_directory_is_unknown_and_never_an_error() {
        let fixture = Fixture::new("empty");
        let root = fixture.root();

        let info = open_project(root.to_string_lossy().into_owned()).expect("open project");
        let fallback = root
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .expect("fixture has a file name");

        assert_eq!(info.kind, ProjectKind::Unknown);
        assert_eq!(Path::new(&info.build_root), root);
        assert_eq!(info.root, root.to_string_lossy());
        assert_eq!(info.name, fallback);
        assert_eq!(info.launch_config, None);
    }

    #[test]
    fn launch_config_is_reported_when_present() {
        let fixture = Fixture::new("launch");
        fixture.write("compile_commands.json", "[]\n");
        fixture.write(".quarry/launch.json", "{}\n");
        let root = fixture.root();

        let info = open_project(root.to_string_lossy().into_owned()).expect("open project");
        let expected = root
            .join(".quarry/launch.json")
            .to_string_lossy()
            .into_owned();

        assert_eq!(info.kind, ProjectKind::CompileCommands);
        assert_eq!(info.launch_config, Some(expected));
    }

    #[test]
    fn a_missing_root_is_an_error() {
        let fixture = Fixture::new("missing");
        let missing = fixture.path.join("does-not-exist");

        let error = open_project(missing.to_string_lossy().into_owned()).expect_err("should fail");
        assert!(
            error.contains("does-not-exist"),
            "unexpected error: {error}"
        );
    }
}
