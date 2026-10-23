#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{LaunchConfig, ProjectKind};
pub use serde_json::Value;
pub use std::env;
pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::process::Command;

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_2 {
    use super::*;

    /// Metadata as `cargo metadata --no-deps` prints it, reduced to the fields this module reads.
    pub fn metadata(json: &str) -> Value {
        serde_json::from_str(json).expect("metadata fixture is valid JSON")
    }

    pub fn one_bin() -> Value {
        metadata(
            r#"{
                "target_directory": "/work/demo/target",
                "packages": [{
                    "name": "demo",
                    "targets": [
                        { "name": "demo_lib", "kind": ["lib"] },
                        { "name": "demo", "kind": ["bin"] }
                    ]
                }]
            }"#,
        )
    }

    #[test]
    pub fn lldb_lookup_is_the_fallback_a_modern_toolchain_needs() {
        let etc = Path::new("/toolchains/stable-aarch64-apple-darwin/lib/rustlib/etc");

        let commands = select_init_commands(etc, false, true);

        assert_eq!(
            commands,
            vec![
                "command script import \
                 /toolchains/stable-aarch64-apple-darwin/lib/rustlib/etc/lldb_lookup.py"
                    .to_string()
            ]
        );
    }

    #[test]
    pub fn no_provider_files_means_no_init_commands_and_no_error() {
        let etc = Path::new("/toolchains/stable-aarch64-apple-darwin/lib/rustlib/etc");

        assert!(select_init_commands(etc, false, false).is_empty());
    }

    #[test]
    pub fn both_provider_paths_compose_under_lib_rustlib_etc() {
        let sysroot = Path::new("/toolchains/stable-aarch64-apple-darwin");

        let etc = rustlib_etc(sysroot);

        assert_eq!(
            etc,
            PathBuf::from("/toolchains/stable-aarch64-apple-darwin/lib/rustlib/etc")
        );
        assert!(
            etc.join(LLDB_COMMANDS)
                .ends_with("lib/rustlib/etc/lldb_commands")
        );
        assert!(
            etc.join(LLDB_LOOKUP)
                .ends_with("lib/rustlib/etc/lldb_lookup.py")
        );
    }

    #[test]
    pub fn a_missing_binary_asks_for_a_build() {
        let error = missing_binary("/work/demo/target/debug/demo", "/work/demo");

        assert!(
            error.contains("/work/demo/target/debug/demo"),
            "error names no program: {error}"
        );
        assert!(error.contains("build"), "error asks for no build: {error}");
        assert!(error.contains("/work/demo"), "error names no root: {error}");
    }

    #[test]
    pub fn a_non_cargo_project_asks_for_a_preset() {
        for kind in [
            ProjectKind::Cmake,
            ProjectKind::CompileCommands,
            ProjectKind::Unknown,
        ] {
            let error = require_cargo(kind).expect_err("only Cargo resolves a binary");
            assert!(
                error.contains(".quarry/launch.json"),
                "{kind:?} error names no preset file: {error}"
            );
        }
    }

    #[test]
    pub fn a_preset_is_not_needed_for_cargo() {
        assert!(require_cargo(ProjectKind::Cargo).is_ok());
    }

    #[test]
    pub fn an_ambiguous_workspace_names_the_packages() {
        let metadata = metadata(
            r#"{
                "target_directory": "/work/demo/target",
                "packages": [
                    { "name": "alpha", "targets": [{ "name": "alpha", "kind": ["bin"] }] },
                    { "name": "beta", "targets": [{ "name": "beta", "kind": ["bin"] }] }
                ]
            }"#,
        );

        let error = find_bin_target(&metadata, "gamma").expect_err("no package match must fail");

        assert!(error.contains("alpha"), "unexpected error: {error}");
        assert!(error.contains("beta"), "unexpected error: {error}");
        assert!(error.contains("gamma"), "unexpected error: {error}");
    }
}
