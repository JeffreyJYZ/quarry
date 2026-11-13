#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// What a preset leaves to the command line: build type, database and the user's overrides.
#[cfg(test)]
#[allow(dead_code)]
pub mod tests_cmake_argv_preset {
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
    fn a_preset_without_a_build_type_gets_the_profiles_and_says_so() {
        let (_directory, root) = root("cmake-argv-no-type");
        write(
            &root,
            r#"{ "version": 3, "configurePresets": [
                { "name": "dev", "binaryDir": "${sourceDir}/out/dev" }
            ] }"#,
        );

        let plan = plan_for(&root, true, &CmakeOptions::default());

        assert!(
            plan.configure
                .contains(&"-DCMAKE_BUILD_TYPE=Release".to_string()),
            "argv: {:?}",
            plan.configure
        );
        let note = plan.note.expect("the forced build type is reported");
        assert!(note.contains("CMAKE_BUILD_TYPE=Release"), "note: {note}");
        assert!(note.contains("debug info"), "note: {note}");
    }

    #[test]
    fn a_preset_that_turns_the_database_off_is_respected_and_reported() {
        let (_directory, root) = root("cmake-argv-database-off");
        write(
            &root,
            r#"{ "version": 3, "configurePresets": [ {
                "name": "dev", "binaryDir": "${sourceDir}/out/dev",
                "cacheVariables": { "CMAKE_EXPORT_COMPILE_COMMANDS": false }
            } ] }"#,
        );

        let plan = plan_for(&root, false, &CmakeOptions::default());

        assert!(
            !plan
                .configure
                .iter()
                .any(|arg| arg.starts_with("-DCMAKE_EXPORT_COMPILE_COMMANDS"))
        );
        let note = plan.note.expect("the missing database is reported");
        assert!(note.contains("no compiler database"), "note: {note}");
    }

    #[test]
    fn a_users_build_directory_overrides_the_presets_and_keeps_the_explicit_build() {
        let (_directory, root) = root("cmake-argv-override");
        write(
            &root,
            r#"{ "version": 3, "configurePresets": [ {
                "name": "dev", "binaryDir": "${sourceDir}/out/dev"
            } ] }"#,
        );
        let options = CmakeOptions {
            build_dir: "custom".to_string(),
            ..CmakeOptions::default()
        };

        let plan = plan_for(&root, false, &options);
        let custom = root.join("custom");

        assert_eq!(plan.build_root, custom);
        assert_eq!(
            argv(&plan.configure),
            vec![
                "cmake",
                "--preset",
                "dev",
                "-S",
                root.to_str().expect("root"),
                "-B",
                custom.to_str().expect("custom"),
                "-DCMAKE_BUILD_TYPE=Debug",
                "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
            ]
        );
        assert_eq!(
            argv(&plan.build),
            vec![
                "cmake",
                "--build",
                custom.to_str().expect("custom"),
                "--config",
                "Debug",
            ],
            "a build preset would build the preset's directory, not this one"
        );
    }

    #[test]
    fn a_users_toolchain_file_overrides_the_presets() {
        let (_directory, root) = root("cmake-argv-toolchain-override");
        write(
            &root,
            r#"{ "version": 3, "configurePresets": [ {
                "name": "dev", "binaryDir": "${sourceDir}/out/dev",
                "cacheVariables": {
                    "CMAKE_BUILD_TYPE": "Debug",
                    "CMAKE_TOOLCHAIN_FILE": "/project/arm.cmake"
                }
            } ] }"#,
        );
        let options = CmakeOptions {
            toolchain_file: "/mine/arm.cmake".to_string(),
            ..CmakeOptions::default()
        };

        let plan = plan_for(&root, false, &options);

        assert_eq!(
            plan.configure.last().map(String::as_str),
            Some("-DCMAKE_TOOLCHAIN_FILE=/mine/arm.cmake"),
            "a later -D overrides the preset's cache entry"
        );
    }
}
