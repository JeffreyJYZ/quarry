#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// Which directory a project builds in, for every shape a machine is actually found in.
#[cfg(test)]
#[allow(dead_code)]
pub mod tests_cmake_root {
    use super::*;
    use crate::test_support::TempDir;

    fn project(tag: &str) -> (TempDir, PathBuf) {
        let directory = TempDir::new(tag);
        let root = directory.path().canonicalize().expect("canonical root");
        (directory, root)
    }

    fn configure(dir: &Path, marker: &str) {
        fs::create_dir_all(dir).expect("mkdir");
        fs::write(dir.join(marker), "").expect("marker");
    }

    fn resolved(root: &Path) -> PathBuf {
        resolve(root, &CmakeOptions::default(), None)
    }

    #[test]
    fn a_project_nobody_configured_builds_into_build() {
        let (_directory, root) = project("cmake-fresh");
        assert_eq!(resolved(&root), root.join(BUILD_DIR));
    }

    #[test]
    fn an_in_source_configure_beats_a_new_build_directory() {
        let (_directory, root) = project("cmake-in-source");
        configure(&root, CMAKE_CACHE);
        assert_eq!(resolved(&root), root);
    }

    #[test]
    fn every_conventional_directory_is_recognised() {
        for name in [
            BUILD_DIR,
            QUARRY_BUILD_DIR,
            CLION_BUILD_DIRS[0],
            CLION_BUILD_DIRS[1],
        ] {
            let tag = format!("cmake-conventional-{}", name.replace('/', "-"));
            let (_directory, root) = project(&tag);
            configure(&root.join(name), CMAKE_CACHE);
            assert_eq!(resolved(&root), root.join(name), "{name} was not detected");
        }
    }

    #[test]
    fn an_absent_directory_is_never_chosen_over_a_configured_one() {
        let (_directory, root) = project("cmake-absent");
        fs::create_dir_all(root.join(CLION_BUILD_DIRS[1]).join(CMAKE_FILES_DIR)).expect("marker");
        // `build` sits later in the list but does not exist, so it cannot win.
        assert_eq!(resolved(&root), root.join(CLION_BUILD_DIRS[1]));
    }

    #[test]
    fn a_cmake_files_directory_or_a_database_alone_marks_a_configured_tree() {
        let (_directory, root) = project("cmake-files");
        fs::create_dir_all(root.join(BUILD_DIR).join(CMAKE_FILES_DIR)).expect("marker");
        assert_eq!(resolved(&root), root.join(BUILD_DIR));

        let (_second, other) = project("cmake-database");
        fs::write(other.join(COMPILE_DATABASE), "[]").expect("database");
        assert_eq!(resolved(&other), other);
    }

    #[test]
    fn a_presets_binary_directory_is_a_candidate_of_its_own() {
        let (_directory, root) = project("cmake-preset-binary");
        let preset = root.join("out").join("dev");
        configure(&preset, CMAKE_CACHE);
        assert_eq!(
            resolve(&root, &CmakeOptions::default(), Some(&preset)),
            preset
        );
    }

    #[test]
    fn an_unconfigured_preset_directory_loses_to_a_configured_tree() {
        let (_directory, root) = project("cmake-existing-beats-preset");
        let preset = root.join("out").join("dev");
        configure(&root.join(BUILD_DIR), CMAKE_CACHE);
        assert_eq!(
            resolve(&root, &CmakeOptions::default(), Some(&preset)),
            root.join(BUILD_DIR)
        );
    }

    #[test]
    fn an_unconfigured_presets_directory_is_still_the_answer() {
        let (_directory, root) = project("cmake-preset-only");
        let preset = root.join("out").join("dev");
        assert_eq!(
            resolve(&root, &CmakeOptions::default(), Some(&preset)),
            preset
        );
    }

    #[test]
    fn the_users_directory_overrides_every_detected_tree() {
        let (_directory, root) = project("cmake-user-override");
        configure(&root.join(BUILD_DIR), CMAKE_CACHE);
        let relative = CmakeOptions {
            build_dir: "elsewhere".to_string(),
            ..CmakeOptions::default()
        };
        assert_eq!(resolve(&root, &relative, None), root.join("elsewhere"));

        let absolute = CmakeOptions {
            build_dir: "/tmp/quarry-cmake-tree".to_string(),
            ..CmakeOptions::default()
        };
        assert_eq!(
            resolve(&root, &absolute, None),
            PathBuf::from("/tmp/quarry-cmake-tree")
        );
    }

    #[test]
    fn detection_names_the_preset_and_the_directory_it_decided() {
        let (_directory, root) = project("cmake-detect");
        fs::write(
            root.join(PRESETS_FILE),
            r#"{ "version": 3, "configurePresets": [
                { "name": "dev", "binaryDir": "${sourceDir}/out/dev" }
            ] }"#,
        )
        .expect("presets");

        let (dir, preset) = detect_build_root(&root, &CmakeOptions::default());

        assert_eq!(preset.as_deref(), Some("dev"));
        assert_eq!(dir, root.join("out").join("dev"));
    }
}
