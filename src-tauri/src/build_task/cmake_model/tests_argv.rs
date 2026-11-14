#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// The argv each shape of project produces, spelled out rather than described.
#[cfg(test)]
#[allow(dead_code)]
pub mod tests_cmake_argv {
    use super::*;
    use crate::test_support::TempDir;

    fn root(tag: &str) -> (TempDir, PathBuf) {
        let directory = TempDir::new(tag);
        let path = directory.path().canonicalize().expect("canonical root");
        (directory, path)
    }

    fn write(root: &Path, text: &str) {
        fs::write(root.join(PRESETS_FILE), text).expect("presets");
    }

    fn argv(argv: &[String]) -> Vec<&str> {
        argv.iter().map(String::as_str).collect()
    }

    fn plan_for(root: &Path, release: bool, options: &CmakeOptions) -> CmakePlan {
        cmake_plan(root, release, options).expect("plan")
    }

    #[test]
    fn no_preset_keeps_the_explicit_recipe_and_says_the_generator_is_cmakes() {
        let (_directory, root) = root("cmake-argv-plain");
        let plan = plan_for(&root, false, &CmakeOptions::default());
        let build = root.join(BUILD_DIR);

        assert_eq!(
            argv(&plan.configure),
            vec![
                "cmake",
                "-S",
                root.to_str().expect("root"),
                "-B",
                build.to_str().expect("build"),
                "-DCMAKE_BUILD_TYPE=Debug",
                "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
            ]
        );
        assert_eq!(
            argv(&plan.build),
            vec![
                "cmake",
                "--build",
                build.to_str().expect("build"),
                "--config",
                "Debug",
            ]
        );
        assert_eq!(plan.build_root, build);
        // Nothing on disk names a generator, so the type is passed for debug info and the choice is
        // reported rather than silent.
        let note = plan.note.expect("the generator cmake picks is reported");
        assert!(note.contains("cmake picks one"), "note: {note}");
        assert!(note.contains("-DCMAKE_BUILD_TYPE=Debug"), "note: {note}");
        assert!(note.contains("--config Debug"), "note: {note}");
    }

    #[test]
    fn a_toolchain_file_from_settings_is_appended_to_the_explicit_recipe() {
        let (_directory, root) = root("cmake-argv-toolchain");
        let options = CmakeOptions {
            toolchain_file: "/opt/toolchains/arm.cmake".to_string(),
            ..CmakeOptions::default()
        };

        let plan = plan_for(&root, true, &options);

        assert_eq!(
            argv(&plan.configure),
            vec![
                "cmake",
                "-S",
                root.to_str().expect("root"),
                "-B",
                root.join(BUILD_DIR).to_str().expect("build"),
                "-DCMAKE_BUILD_TYPE=Release",
                "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
                "-DCMAKE_TOOLCHAIN_FILE=/opt/toolchains/arm.cmake",
            ]
        );
        assert_eq!(plan.build.last().map(String::as_str), Some("Release"));
    }

    #[test]
    fn a_preset_drives_both_halves_and_adds_only_the_database() {
        let (_directory, root) = root("cmake-argv-preset");
        write(
            &root,
            r#"{ "version": 3,
                "configurePresets": [ {
                    "name": "dev", "generator": "Ninja",
                    "binaryDir": "${sourceDir}/out/dev",
                    "cacheVariables": { "CMAKE_BUILD_TYPE": "Debug" }
                } ],
                "buildPresets": [ { "name": "dev", "configurePreset": "dev" } ] }"#,
        );
        let plan = plan_for(&root, false, &CmakeOptions::default());
        let build = root.join("out").join("dev");

        assert_eq!(
            argv(&plan.configure),
            vec![
                "cmake",
                "--preset",
                "dev",
                "-S",
                root.to_str().expect("root"),
                "-B",
                build.to_str().expect("build"),
                "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
            ],
            "the preset's own build type must not be overridden"
        );
        assert_eq!(
            argv(&plan.build),
            vec!["cmake", "--build", "--preset", "dev", "--config", "Debug"]
        );
        assert_eq!(plan.build_root, build);
        assert_eq!(plan.note, None);
    }
}
