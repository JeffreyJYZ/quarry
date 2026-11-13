#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// Reading the preset files: inheritance, the user override, and the values a build depends on.
#[cfg(test)]
#[allow(dead_code)]
pub mod tests_cmake_preset {
    use super::*;
    use crate::test_support::TempDir;

    fn root(tag: &str) -> (TempDir, PathBuf) {
        let directory = TempDir::new(tag);
        let path = directory.path().canonicalize().expect("canonical root");
        (directory, path)
    }

    fn write(root: &Path, file: &str, text: &str) {
        fs::write(root.join(file), text).expect("write preset file");
    }

    const PROJECT: &str = r#"{
        "version": 3,
        "configurePresets": [
            {
                "name": "base",
                "hidden": true,
                "generator": "Ninja",
                "cacheVariables": {
                    "CMAKE_TOOLCHAIN_FILE": "/opt/toolchains/arm.cmake",
                    "CMAKE_BUILD_TYPE": "Debug", "CMAKE_CXX_STANDARD": "20",
                    "CMAKE_EXPORT_COMPILE_COMMANDS": true
                }
            },
            {
                "name": "dev",
                "inherits": "base",
                "binaryDir": "${sourceDir}/out/${presetName}",
                "cacheVariables": { "CMAKE_CXX_STANDARD": "23" }
            }
        ],
        "buildPresets": [ { "name": "dev", "configurePreset": "dev" } ]
    }"#;

    #[test]
    fn a_preset_carries_its_binary_dir_generator_and_cache_variables() {
        let (_directory, path) = root("cmake-preset-values");
        write(&path, PRESETS_FILE, PROJECT);
        let presets = load(&path);

        let resolved = resolve_configure(&presets, "dev", &path).expect("resolve dev");

        assert_eq!(resolved.generator.as_deref(), Some("Ninja"));
        assert_eq!(
            resolved.binary_dir,
            Some(path.join("out").join("dev")),
            "binaryDir must expand ${{sourceDir}} and ${{presetName}}"
        );
        assert_eq!(
            resolved
                .cache
                .get("CMAKE_TOOLCHAIN_FILE")
                .map(String::as_str),
            Some("/opt/toolchains/arm.cmake"),
            "the inherited toolchain file is carried through"
        );
        assert_eq!(
            resolved.cache.get("CMAKE_BUILD_TYPE").map(String::as_str),
            Some("Debug")
        );
        assert_eq!(
            resolved.cache.get("CMAKE_CXX_STANDARD").map(String::as_str),
            Some("23"),
            "the child overrides the parent's value"
        );
        assert_eq!(
            resolved
                .cache
                .get("CMAKE_EXPORT_COMPILE_COMMANDS")
                .map(String::as_str),
            Some("ON"),
            "a bare true is ON"
        );
    }

    #[test]
    fn inherits_accepts_a_list_and_is_applied_left_to_right() {
        let (_directory, path) = root("cmake-preset-list");
        write(
            &path,
            PRESETS_FILE,
            r#"{ "version": 3, "configurePresets": [
                { "name": "one", "hidden": true, "cacheVariables": { "A": "1", "B": "1" } },
                { "name": "two", "hidden": true, "cacheVariables": { "B": "2", "C": "2" } },
                { "name": "leaf", "inherits": ["one", "two"] }
            ] }"#,
        );

        let resolved = resolve_configure(&load(&path), "leaf", &path).expect("resolve leaf");

        assert_eq!(resolved.cache.get("A").map(String::as_str), Some("1"));
        assert_eq!(
            resolved.cache.get("B").map(String::as_str),
            Some("2"),
            "the later parent wins"
        );
        assert_eq!(resolved.cache.get("C").map(String::as_str), Some("2"));
    }

    #[test]
    fn a_user_preset_replaces_the_project_preset_of_the_same_name() {
        let (_directory, path) = root("cmake-preset-user");
        write(
            &path,
            PRESETS_FILE,
            r#"{ "version": 3, "configurePresets": [
                { "name": "dev", "binaryDir": "${sourceDir}/out/project",
                  "cacheVariables": { "CMAKE_CXX_COMPILER": "/usr/bin/clang++" } }
            ] }"#,
        );
        write(
            &path,
            USER_PRESETS_FILE,
            r#"{ "version": 3, "configurePresets": [
                { "name": "dev", "binaryDir": "${sourceDir}/out/mine",
                  "cacheVariables": { "CMAKE_CXX_COMPILER": "/opt/homebrew/bin/g++-14" } }
            ] }"#,
        );

        let presets = load(&path);
        let resolved = resolve_configure(&presets, "dev", &path).expect("resolve dev");

        assert_eq!(presets.configure.len(), 1, "the user's entry replaces it");
        assert_eq!(resolved.binary_dir, Some(path.join("out").join("mine")));
        assert_eq!(
            resolved.cache.get("CMAKE_CXX_COMPILER").map(String::as_str),
            Some("/opt/homebrew/bin/g++-14"),
            "a second toolchain is selectable without editing the project's file"
        );
    }

    #[test]
    fn a_cycle_is_reported_instead_of_walked() {
        let (_directory, path) = root("cmake-preset-cycle");
        write(
            &path,
            PRESETS_FILE,
            r#"{ "version": 3, "configurePresets": [
                { "name": "a", "inherits": "b" },
                { "name": "b", "inherits": "a" }
            ] }"#,
        );

        let error = resolve_configure(&load(&path), "a", &path).expect_err("a cycle must fail");

        assert!(
            error.contains("inherits itself"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn a_missing_parent_is_reported() {
        let (_directory, path) = root("cmake-preset-missing-parent");
        write(
            &path,
            PRESETS_FILE,
            r#"{ "version": 3, "configurePresets": [ { "name": "a", "inherits": "gone" } ] }"#,
        );

        let error = resolve_configure(&load(&path), "a", &path).expect_err("no parent");

        assert!(error.contains("\"gone\""), "unexpected error: {error}");
    }

    #[test]
    fn a_preset_file_that_is_not_json_is_named_and_ignored() {
        let (_directory, path) = root("cmake-preset-invalid");
        write(&path, PRESETS_FILE, "{ not json");

        let presets = load(&path);

        assert!(presets.configure.is_empty());
        assert_eq!(presets.invalid, vec![PRESETS_FILE.to_string()]);
    }

    #[test]
    fn no_preset_files_mean_no_presets() {
        let (_directory, path) = root("cmake-preset-none");

        let presets = load(&path);

        assert!(presets.configure.is_empty());
        assert!(presets.build.is_empty());
        assert!(presets.invalid.is_empty());
    }
}
