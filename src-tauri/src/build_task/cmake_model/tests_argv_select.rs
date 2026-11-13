#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// What happens when the project offers more than one way to build, or no usable one.
#[cfg(test)]
#[allow(dead_code)]
pub mod tests_cmake_argv_select {
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
    fn several_presets_and_no_choice_fall_back_and_say_how_many() {
        let (_directory, root) = root("cmake-argv-ambiguous");
        write(
            &root,
            r#"{ "version": 3, "configurePresets": [
                { "name": "dev" }, { "name": "release" }
            ] }"#,
        );

        let plan = plan_for(&root, false, &CmakeOptions::default());

        assert_eq!(plan.configure[1], "-S", "the explicit recipe is used");
        let note = plan.note.expect("the ambiguity is reported");
        assert!(note.contains("2 configure presets"), "note: {note}");
    }

    #[test]
    fn a_named_preset_that_does_not_exist_fails_the_build_loudly() {
        let (_directory, root) = root("cmake-argv-named");
        write(
            &root,
            r#"{ "version": 3, "configurePresets": [ { "name": "dev" } ] }"#,
        );
        let options = CmakeOptions {
            preset: "staging".to_string(),
            ..CmakeOptions::default()
        };

        let error = cmake_plan(&root, false, &options).expect_err("unknown preset");

        assert!(error.contains("staging"), "unexpected error: {error}");
    }

    #[test]
    fn a_multi_config_generator_takes_the_configuration_at_build_time_only() {
        let (_directory, root) = root("cmake-argv-multi");
        write(
            &root,
            r#"{ "version": 3, "configurePresets": [ {
                "name": "dev", "generator": "Xcode",
                "binaryDir": "${sourceDir}/out/dev"
            } ] }"#,
        );

        let plan = plan_for(&root, true, &CmakeOptions::default());

        assert!(
            !plan
                .configure
                .iter()
                .any(|arg| arg.starts_with("-DCMAKE_BUILD_TYPE")),
            "argv: {:?}",
            plan.configure
        );
        assert!(
            !plan
                .configure
                .iter()
                .any(|arg| arg.starts_with("-DCMAKE_EXPORT_COMPILE_COMMANDS")),
            "Xcode writes no compile_commands.json"
        );
        assert_eq!(plan.build.last().map(String::as_str), Some("Release"));
        assert_eq!(plan.note, None);
    }

    #[test]
    fn a_build_presets_configuration_beats_the_cache_and_the_profile() {
        let (_directory, root) = root("cmake-argv-build-config");
        write(
            &root,
            r#"{ "version": 3,
                "configurePresets": [ {
                    "name": "dev", "binaryDir": "${sourceDir}/out/dev",
                    "cacheVariables": { "CMAKE_BUILD_TYPE": "Debug" }
                } ],
                "buildPresets": [ {
                    "name": "dev-release", "configurePreset": "dev",
                    "configuration": "RelWithDebInfo"
                } ] }"#,
        );

        let plan = plan_for(&root, false, &CmakeOptions::default());

        assert_eq!(
            argv(&plan.build),
            vec![
                "cmake",
                "--build",
                "--preset",
                "dev-release",
                "--config",
                "RelWithDebInfo",
            ]
        );
    }
}
