#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// Real configure and build runs, so the argv is proven against cmake rather than only asserted.
#[cfg(all(test, unix))]
#[allow(dead_code)]
pub mod tests_cmake_fixture {
    use super::*;
    use crate::build_task::*;
    use crate::test_support::TempDir;

    fn available() -> bool {
        crate::resolve::resolve(CMAKE_PROGRAM).is_some()
    }

    fn project(tag: &str) -> Option<(TempDir, PathBuf)> {
        if !available() {
            return None;
        }
        let directory = TempDir::new(tag);
        let root = directory.path().canonicalize().expect("canonical root");
        fs::write(
            root.join("CMakeLists.txt"),
            "cmake_minimum_required(VERSION 3.20)\nproject(demo CXX)\nadd_executable(demo main.cpp)\n",
        )
        .expect("manifest");
        fs::write(root.join("main.cpp"), "int main() { return 0; }\n").expect("source");
        Some((directory, root))
    }

    fn build(root: &Path) -> BuildReport {
        run_cmake_build(
            &BuildState::default(),
            &root.display().to_string(),
            false,
            None,
        )
        .expect("cmake must be runnable")
    }

    #[test]
    fn a_preset_driven_project_builds_into_the_presets_directory() {
        let Some((_directory, root)) = project("cmake-fixture-preset") else {
            return;
        };
        fs::write(
            root.join(PRESETS_FILE),
            r#"{ "version": 3,
                "configurePresets": [ {
                    "name": "dev",
                    "binaryDir": "${sourceDir}/out/dev",
                    "cacheVariables": { "CMAKE_BUILD_TYPE": "Debug" }
                } ],
                "buildPresets": [ { "name": "dev", "configurePreset": "dev" } ] }"#,
        )
        .expect("presets");

        let report = build(&root);
        let binary = root.join("out").join("dev").join("demo");

        assert!(
            report.success,
            "the preset build failed: {}",
            report.summary
        );
        assert!(
            root.join("out")
                .join("dev")
                .join(COMPILE_DATABASE)
                .is_file(),
            "the compiler database the preset directory owes clangd"
        );
        assert!(
            binary.is_file(),
            "the binary appeared where the preset says"
        );
        assert_eq!(
            report.artifact,
            Some(binary.display().to_string()),
            "the reported artifact is the program this build wrote"
        );
        assert!(
            !root.join(CMAKE_CACHE).exists() && !root.join(BUILD_DIR).join(CMAKE_CACHE).exists(),
            "a preset build must not configure anywhere else"
        );
    }

    #[test]
    fn a_toolchain_file_from_settings_is_used_by_the_configure_step() {
        let Some((_directory, root)) = project("cmake-fixture-toolchain") else {
            return;
        };
        let toolchain = root.join("arm-toolchain.cmake");
        fs::write(
            &toolchain,
            "set(QUARRY_TOOLCHAIN \"yes\" CACHE STRING \"proves this file ran\")\n",
        )
        .expect("toolchain");
        fs::write(
            root.join("CMakeLists.txt"),
            "cmake_minimum_required(VERSION 3.20)\nproject(demo CXX)\n\
             if(NOT QUARRY_TOOLCHAIN)\n  message(FATAL_ERROR \"the toolchain file was not used\")\nendif()\n\
             add_executable(demo main.cpp)\n",
        )
        .expect("manifest");
        fs::create_dir_all(root.join(".quarry")).expect("settings dir");
        fs::write(
            root.join(".quarry").join("settings.json"),
            format!(
                "{{ \"cmakeToolchainFile\": {} }}\n",
                serde_json::Value::String(toolchain.display().to_string())
            ),
        )
        .expect("settings");

        let report = build(&root);
        let build_root = root.join(BUILD_DIR);

        assert!(
            report.success,
            "the toolchain build failed: {}",
            report.summary
        );
        assert!(
            build_root.join(COMPILE_DATABASE).is_file(),
            "the default build directory still gets a database"
        );
        assert!(build_root.join("demo").is_file(), "the binary was written");
    }
}
