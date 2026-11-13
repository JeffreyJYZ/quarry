#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// Choosing between presets, and matching a build preset to its configure preset.
#[cfg(test)]
#[allow(dead_code)]
pub mod tests_cmake_preset_select {
    use super::*;
    use crate::test_support::TempDir;

    fn root(tag: &str) -> (TempDir, PathBuf) {
        let directory = TempDir::new(tag);
        let path = directory.path().canonicalize().expect("canonical root");
        (directory, path)
    }

    fn write(root: &Path, text: &str) {
        fs::write(root.join(PRESETS_FILE), text).expect("write preset file");
    }

    #[test]
    fn the_only_visible_preset_is_chosen_and_several_are_not() {
        let (_directory, path) = root("cmake-preset-select");
        write(
            &path,
            r#"{ "version": 3, "configurePresets": [
                { "name": "base", "hidden": true },
                { "name": "dev" }
            ] }"#,
        );
        assert_eq!(
            select_configure(&load(&path), "").expect("select"),
            Some("dev".to_string())
        );

        write(
            &path,
            r#"{ "version": 3, "configurePresets": [
                { "name": "dev" }, { "name": "release" }
            ] }"#,
        );
        let presets = load(&path);
        assert_eq!(select_configure(&presets, "").expect("select"), None);
        assert_eq!(visible_configure(&presets), 2);
    }

    #[test]
    fn a_named_preset_that_does_not_exist_is_an_error_naming_the_files() {
        let (_directory, path) = root("cmake-preset-unknown");
        write(&path, r#"{ "version": 3, "configurePresets": [] }"#);

        let error = select_configure(&load(&path), "nope").expect_err("unknown name");

        assert!(error.contains("nope"), "unexpected error: {error}");
        assert!(error.contains(PRESETS_FILE), "unexpected error: {error}");
        assert!(
            error.contains(USER_PRESETS_FILE),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn a_hidden_preset_is_never_selected_even_by_name() {
        let (_directory, path) = root("cmake-preset-hidden");
        write(
            &path,
            r#"{ "version": 3, "configurePresets": [ { "name": "base", "hidden": true } ] }"#,
        );

        let error = select_configure(&load(&path), "base").expect_err("hidden");

        assert!(error.contains("hidden"), "unexpected error: {error}");
        assert_eq!(select_configure(&load(&path), "").expect("auto"), None);
    }

    #[test]
    fn a_build_preset_belongs_to_its_configure_preset_and_carries_configuration() {
        let (_directory, path) = root("cmake-preset-build");
        write(
            &path,
            r#"{ "version": 3,
                "configurePresets": [ { "name": "dev" } ],
                "buildPresets": [
                    { "name": "release-build", "configurePreset": "dev", "configuration": "Release" },
                    { "name": "debug-build", "configurePreset": "dev" }
                ] }"#,
        );

        let presets = load(&path);
        let named = build_preset(&presets, "dev").expect("a build preset belongs to dev");

        assert_eq!(named.name, "release-build");
        assert_eq!(
            resolve_build(&presets, &named.name)
                .and_then(|resolved| resolved.configuration)
                .as_deref(),
            Some("Release")
        );
    }

    #[test]
    fn a_build_preset_of_another_configure_preset_is_not_borrowed() {
        let (_directory, path) = root("cmake-preset-other-build");
        write(
            &path,
            r#"{ "version": 3,
                "configurePresets": [ { "name": "dev" }, { "name": "release" } ],
                "buildPresets": [ { "name": "release", "configurePreset": "release" } ] }"#,
        );

        let presets = load(&path);

        assert!(
            build_preset(&presets, "dev").is_none(),
            "dev has no build preset of its own"
        );
    }
}
