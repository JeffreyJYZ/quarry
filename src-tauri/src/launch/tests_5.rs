#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{LaunchConfig, ProjectInfo, ProjectKind, RunTarget};
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_5 {
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

    fn cmake_project(tag: &str) -> TempDir {
        let directory = TempDir::new(tag);
        write_file(
            directory.path(),
            "CMakeLists.txt",
            "project(demo)\nadd_executable(app main.cpp)\n",
        );
        directory
    }

    #[test]
    pub fn a_built_cpp_executable_is_listed_by_stem() {
        let directory = cmake_project("run-cpp-built");
        let built = write_file(directory.path(), "build/app", "binary");

        let targets = list_targets(&root_of(&directory)).expect("a CMake project lists");

        assert_eq!(targets.len(), 1, "unexpected targets: {targets:?}");
        assert_eq!(targets[0].id, "cpp:app");
        assert_eq!(targets[0].label, "app");
        assert_eq!(targets[0].kind, "cpp");
        assert!(targets[0].package.is_empty(), "C/C++ has no package");
        assert_eq!(targets[0].target, "app");
        assert_eq!(
            TargetId::Cpp {
                target: "app".to_string()
            },
            parse_target_id(&targets[0].id).expect("parses")
        );
        assert!(
            built.is_file(),
            "the listed executable must be the built file"
        );
    }

    #[test]
    pub fn a_resolved_cpp_target_is_the_built_executable() {
        let directory = cmake_project("run-cpp-resolve");
        write_file(directory.path(), "build/app", "binary");
        let canonical = directory.path().canonicalize().expect("canonical root");

        let config = resolve_target(&root_of(&directory), "cpp:app", true).expect("app resolves");

        assert_eq!(
            Path::new(&config.program),
            canonical.join("build").join("app"),
            "the resolved program is not the built executable"
        );
        assert_eq!(Path::new(&config.cwd), canonical);
        assert!(config.stop_on_entry, "stop-on-entry is passed through");
        assert!(
            config.init_commands.is_empty(),
            "C/C++ has no LLDB provider scripts"
        );
    }

    #[test]
    pub fn an_unbuilt_cpp_project_still_lists_its_target() {
        let directory = cmake_project("run-cpp-unbuilt");

        let targets = list_targets(&root_of(&directory)).expect("an unbuilt CMake project lists");

        assert_eq!(targets.len(), 1, "unexpected targets: {targets:?}");
        assert_eq!(targets[0].id, "cpp:app");
    }

    #[test]
    pub fn an_unknown_cpp_target_errors_and_names_what_exists() {
        let directory = cmake_project("run-cpp-unknown");

        let error = resolve_target(&root_of(&directory), "cpp:missing", false)
            .expect_err("an undeclared executable fails");

        assert!(error.contains("cpp:missing"), "unexpected error: {error}");
        assert!(
            error.contains("cpp:app"),
            "the error does not name what exists: {error}"
        );
    }

    #[test]
    pub fn an_unknown_directory_lists_nothing_instead_of_failing() {
        let directory = TempDir::new("run-plain");

        let targets = list_targets(&root_of(&directory)).expect("any directory lists");

        assert!(targets.is_empty(), "unexpected targets: {targets:?}");
    }
}
