#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{LaunchConfig, ProjectInfo, ProjectKind, RunTarget};
pub use serde_json::Value;
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_4 {
    use super::*;
    use crate::test_support::TempDir;

    fn write_file(root: &Path, relative: &str, text: &str) -> PathBuf {
        let path = root.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("temporary parent");
        }
        fs::write(&path, text).expect("temporary file");
        path
    }

    fn root_of(directory: &TempDir) -> String {
        directory.path().display().to_string()
    }

    fn canonical(directory: &TempDir) -> PathBuf {
        directory.path().canonicalize().expect("canonical root")
    }

    fn manifest(name: &str) -> String {
        format!("[package]\nname = \"{name}\"\nversion = \"0.1.0\"\nedition = \"2021\"\n")
    }

    fn solo_project(tag: &str) -> TempDir {
        let directory = TempDir::new(tag);
        write_file(directory.path(), "Cargo.toml", &manifest("solo"));
        write_file(directory.path(), "src/main.rs", "fn main() {}\n");
        directory
    }

    fn workspace_project(tag: &str) -> TempDir {
        let directory = TempDir::new(tag);
        write_file(
            directory.path(),
            "Cargo.toml",
            "[workspace]\nmembers = [\"alpha\", \"beta\"]\nresolver = \"2\"\n",
        );
        write_file(directory.path(), "alpha/Cargo.toml", &manifest("alpha"));
        write_file(directory.path(), "alpha/src/main.rs", "fn main() {}\n");
        write_file(
            directory.path(),
            "alpha/src/bin/alpha-extra.rs",
            "fn main() {}\n",
        );
        write_file(directory.path(), "beta/Cargo.toml", &manifest("beta"));
        write_file(directory.path(), "beta/src/main.rs", "fn main() {}\n");
        directory
    }

    /// Write the executables where `cargo build` would leave them, without running one.
    fn prebuild(root: &str, bins: &[&str]) {
        let cargo = cargo_program().expect("cargo on PATH");
        let metadata = cargo_metadata(&cargo, root).expect("metadata");
        let directory = target_directory(&metadata).expect("target directory");
        for bin in bins {
            write_file(Path::new(directory), &format!("debug/{bin}"), "binary");
        }
    }

    #[test]
    pub fn an_unbuilt_cargo_project_still_lists_its_binary() {
        let directory = solo_project("run-unbuilt");

        let targets = list_targets(&root_of(&directory)).expect("an unbuilt project lists");

        assert_eq!(targets.len(), 1, "unexpected targets: {targets:?}");
        assert_eq!(targets[0].id, "cargo:solo:solo");
        assert_eq!(targets[0].label, "solo", "a single package drops its name");
        assert_eq!(targets[0].kind, "cargo");
        assert_eq!(targets[0].package, "solo");
        assert_eq!(targets[0].target, "solo");
    }

    #[test]
    pub fn a_multi_package_workspace_lists_every_binary() {
        let directory = workspace_project("run-workspace");

        let targets = list_targets(&root_of(&directory)).expect("a workspace lists");
        let ids: Vec<&str> = targets.iter().map(|target| target.id.as_str()).collect();

        assert_eq!(
            ids.len(),
            3,
            "every binary of every package must be listed: {ids:?}"
        );
        assert!(ids.contains(&"cargo:alpha:alpha"));
        assert!(ids.contains(&"cargo:alpha:alpha-extra"));
        assert!(ids.contains(&"cargo:beta:beta"));
        assert!(
            targets
                .iter()
                .all(|target| target.label.ends_with(&format!("({})", target.package))),
            "a workspace names the package in every label: {targets:?}"
        );
        let beta = ids
            .iter()
            .position(|id| id.starts_with("cargo:beta:"))
            .expect("beta");
        let last_alpha = ids
            .iter()
            .rposition(|id| id.starts_with("cargo:alpha:"))
            .expect("alpha");
        assert!(last_alpha < beta, "packages must not interleave: {ids:?}");
    }

    #[test]
    pub fn the_second_binary_of_a_workspace_resolves_to_the_second_binary() {
        let directory = workspace_project("run-second");
        let root = root_of(&directory);
        prebuild(&root, &["alpha", "alpha-extra", "beta"]);

        let extra = resolve_target(&root, "cargo:alpha:alpha-extra", true)
            .expect("the second binary resolves");
        let beta = resolve_target(&root, "cargo:beta:beta", false).expect("beta resolves");

        assert!(
            extra.program.ends_with("debug/alpha-extra"),
            "{}",
            extra.program
        );
        assert!(beta.program.ends_with("debug/beta"), "{}", beta.program);
        assert!(Path::new(&extra.program).is_absolute(), "{}", extra.program);
        assert_eq!(Path::new(&extra.cwd), canonical(&directory));
        assert!(extra.stop_on_entry, "stop-on-entry is passed through");
        assert!(!beta.stop_on_entry, "stop-on-entry is passed through");
    }

    #[test]
    pub fn a_cargo_target_keeps_the_lldb_provider_init_command() {
        let directory = solo_project("run-lldb");
        let root = root_of(&directory);
        prebuild(&root, &["solo"]);

        let config = resolve_target(&root, "cargo:solo:solo", false).expect("solo resolves");

        assert_eq!(
            config.init_commands.len(),
            1,
            "the Rust formatters need one entry: {:?}",
            config.init_commands
        );
        assert!(
            config.init_commands[0].contains("rustlib/etc/lldb"),
            "the init command is not the toolchain's provider: {:?}",
            config.init_commands
        );
    }

    #[test]
    pub fn an_unknown_binary_errors_and_names_what_exists() {
        let directory = solo_project("run-unknown-bin");
        let root = root_of(&directory);

        let error =
            resolve_target(&root, "cargo:solo:nope", false).expect_err("an undeclared bin fails");

        assert!(
            error.contains("cargo:solo:nope"),
            "unexpected error: {error}"
        );
        assert!(
            error.contains("cargo:solo:solo"),
            "the error does not name the targets that exist: {error}"
        );
    }

    #[test]
    pub fn a_cpp_id_against_a_cargo_project_errors() {
        let directory = solo_project("run-wrong-kind");

        let error = resolve_target(&root_of(&directory), "cpp:app", false)
            .expect_err("a target of another kind must not resolve");

        assert!(error.contains("cpp:app"), "unexpected error: {error}");
        assert!(error.contains("Cargo"), "unexpected error: {error}");
    }
}
