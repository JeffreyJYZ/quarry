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
pub mod tests_group_1 {
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
    pub fn a_packages_only_binary_target_is_the_program() {
        let bin = find_bin_target(&one_bin(), "demo").expect("one bin resolves");

        assert_eq!(bin, "demo");
        assert_eq!(
            program_path(target_directory(&one_bin()).expect("target dir"), &bin),
            "/work/demo/target/debug/demo"
        );
    }

    #[test]
    pub fn several_bins_prefer_the_one_named_after_the_package() {
        let metadata = metadata(
            r#"{
                "target_directory": "/work/demo/target",
                "packages": [{
                    "name": "demo",
                    "targets": [
                        { "name": "demo-cli", "kind": ["bin"] },
                        { "name": "demo", "kind": ["bin"] },
                        { "name": "demo-server", "kind": ["bin"] }
                    ]
                }]
            }"#,
        );

        assert_eq!(
            find_bin_target(&metadata, "demo").expect("bins resolve"),
            "demo"
        );
    }

    #[test]
    pub fn several_bins_without_a_name_match_take_the_first() {
        let metadata = metadata(
            r#"{
                "target_directory": "/work/demo/target",
                "packages": [{
                    "name": "demo",
                    "targets": [
                        { "name": "first-bin", "kind": ["bin"] },
                        { "name": "second-bin", "kind": ["bin"] }
                    ]
                }]
            }"#,
        );

        assert_eq!(
            find_bin_target(&metadata, "demo").expect("bins resolve"),
            "first-bin"
        );
    }

    #[test]
    pub fn a_package_without_a_bin_target_is_an_error() {
        let metadata = metadata(
            r#"{
                "target_directory": "/work/demo/target",
                "packages": [{
                    "name": "demo",
                    "targets": [{ "name": "demo_lib", "kind": ["lib"] }]
                }]
            }"#,
        );

        let error = find_bin_target(&metadata, "demo").expect_err("no bin target must fail");

        assert!(error.contains("demo"), "unexpected error: {error}");
        assert!(error.contains("binary target"), "unexpected error: {error}");
        assert!(
            error.contains(".quarry/launch.json"),
            "error names no escape hatch: {error}"
        );
    }

    #[test]
    pub fn metadata_without_a_target_directory_is_an_error() {
        let metadata = metadata(r#"{ "packages": [] }"#);

        let error = target_directory(&metadata).expect_err("no target directory must fail");

        assert!(
            error.contains("target directory"),
            "unexpected error: {error}"
        );
    }

    #[test]
    pub fn lldb_commands_wins_over_lldb_lookup() {
        let etc = Path::new("/toolchains/stable-aarch64-apple-darwin/lib/rustlib/etc");

        let commands = select_init_commands(etc, true, true);

        assert_eq!(
            commands,
            vec![
                "command source /toolchains/stable-aarch64-apple-darwin/lib/rustlib/etc/lldb_commands"
                    .to_string()
            ]
        );
    }
}
