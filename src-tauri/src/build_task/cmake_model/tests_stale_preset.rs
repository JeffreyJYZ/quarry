#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// A preset project reloads through its preset, not through a bare `-S … -B build`.
#[cfg(all(test, unix))]
#[allow(dead_code)]
pub mod cmake_stale_preset {
    use super::*;
    use crate::build_task::*;
    use crate::test_support::TempDir;

    fn available() -> bool {
        crate::resolve::resolve(CMAKE_PROGRAM).is_some()
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
    fn a_changed_manifest_reloads_a_preset_project_through_its_preset() {
        if !available() {
            return;
        }
        let directory = TempDir::new("cmake-stale-preset");
        let root = directory.path().canonicalize().expect("canonical root");
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
        fs::write(
            root.join(MANIFEST),
            "cmake_minimum_required(VERSION 3.20)\n\
             project(demo CXX)\n\
             add_executable(demo main.cpp)\n",
        )
        .expect("manifest");
        fs::write(root.join("main.cpp"), "int main() { return 0; }\n").expect("main");

        let first = build(&root);
        assert!(first.success, "the first build failed: {}", first.summary);
        let build_root = root.join("out").join("dev");
        assert!(build_root.join(CMAKE_CACHE).is_file(), "the preset tree");

        fs::write(root.join("extra.cpp"), "int main() { return 2; }\n").expect("extra");
        fs::write(
            root.join(MANIFEST),
            "cmake_minimum_required(VERSION 3.20)\n\
             project(demo CXX)\n\
             add_executable(demo main.cpp)\n\
             add_executable(extra extra.cpp)\n",
        )
        .expect("manifest");

        let reloaded = build(&root);
        assert!(
            reloaded.success,
            "the reloading build failed: {}",
            reloaded.summary
        );
        assert!(
            reloaded.summary.contains("configured again"),
            "the reload is reported: {}",
            reloaded.summary
        );
        assert!(
            cmake_run_targets(&build_root)
                .iter()
                .any(|(name, _)| name == "extra"),
            "the new target is in the preset tree's model"
        );
        assert!(
            !root.join(BUILD_DIR).join(CMAKE_CACHE).exists(),
            "a reload goes through the preset, not a bare -S … -B build"
        );
    }
}
