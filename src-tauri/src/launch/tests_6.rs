#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{LaunchConfig, ProjectInfo, ProjectKind, RunTarget};
pub use serde_json::Value;

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_6 {
    use super::*;

    /// Metadata as `cargo metadata --no-deps` prints it, reduced to the fields listing reads.
    fn metadata(json: &str) -> Value {
        serde_json::from_str(json).expect("metadata fixture is valid JSON")
    }

    #[test]
    pub fn non_binary_targets_never_reach_the_dropdown() {
        let metadata = metadata(
            r#"{
                "packages": [
                    { "name": "demo", "targets": [
                        { "name": "demo_lib", "kind": ["lib"] },
                        { "name": "demo", "kind": ["bin"] },
                        { "name": "helper", "kind": ["example"] },
                        { "name": "smoke", "kind": ["test"] },
                        { "name": "bench", "kind": ["bench"] }
                    ] },
                    { "name": "other", "targets": [{ "name": "other", "kind": ["bin"] }] }
                ]
            }"#,
        );

        let targets = cargo_run_targets(&metadata);

        assert_eq!(
            targets
                .iter()
                .map(|target| target.id.as_str())
                .collect::<Vec<&str>>(),
            vec!["cargo:demo:demo", "cargo:other:other"]
        );
        assert_eq!(targets[0].label, "demo (demo)");
    }

    #[test]
    pub fn an_id_of_no_known_shape_errors_naming_it() {
        let error = parse_target_id("bogus").expect_err("a bad id must not parse");

        assert!(error.contains("bogus"), "unexpected error: {error}");
        assert!(
            error.contains("cargo:<package>:<bin>"),
            "the error does not name the accepted shape: {error}"
        );
    }

    #[test]
    pub fn a_single_package_labels_its_binaries_without_the_package() {
        let metadata = metadata(
            r#"{
                "packages": [{ "name": "demo", "targets": [
                    { "name": "demo", "kind": ["bin"] },
                    { "name": "demo-server", "kind": ["bin"] }
                ] }]
            }"#,
        );

        let labels: Vec<String> = cargo_run_targets(&metadata)
            .into_iter()
            .map(|target| target.label)
            .collect();

        assert_eq!(labels, vec!["demo".to_string(), "demo-server".to_string()]);
    }
}
