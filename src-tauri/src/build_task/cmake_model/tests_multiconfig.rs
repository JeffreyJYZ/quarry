#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// A preset that names no generator leaves the answer to the tree, and a Visual Studio tree must
/// never be told a `CMAKE_BUILD_TYPE` it ignores.
///
/// Both answers the plan used to read named the generator explicitly: the preset's own field, or
/// the cache. A preset written by a helper omits it, and then the only record is the tree's own
/// cache and the file API index it wrote.
#[cfg(test)]
#[allow(dead_code)]
pub mod tests_cmake_multiconfig {
    use super::*;
    use crate::test_support::TempDir;

    const PRESETS: &str = r#"{ "version": 6, "configurePresets": [
        { "name": "dev", "binaryDir": "${sourceDir}/out/dev" }
    ] }"#;

    const VS_CACHE: &str = "CMAKE_GENERATOR:INTERNAL=Visual Studio 17 2022\n\
                            CMAKE_BUILD_TYPE:STRING=\n";

    const VS_INDEX: &str = r#"{
  "cmake": { "generator": { "name": "Visual Studio 17 2022", "multiConfig": true } },
  "objects": [ { "kind": "codemodel", "version": { "major": 2 }, "jsonFile": "model.json" } ]
}"#;

    fn root(tag: &str) -> (TempDir, PathBuf) {
        let directory = TempDir::new(tag);
        let path = directory.path().canonicalize().expect("canonical root");
        fs::write(path.join(PRESETS_FILE), PRESETS).expect("presets");
        fs::write(path.join(MANIFEST), "project(demo CXX)\n").expect("manifest");
        fs::create_dir_all(path.join("out/dev")).expect("preset tree");
        (directory, path)
    }

    fn plan(root: &Path, profile: BuildProfile) -> CmakePlan {
        cmake_plan(root, profile, &CmakeOptions::default()).expect("plan")
    }

    /// Whether `flag value` appears as adjacent argv tokens.
    fn names(argv: &[String], flag: &str, value: &str) -> bool {
        argv.windows(2)
            .any(|pair| pair[0] == flag && pair[1] == value)
    }

    #[test]
    fn a_preset_that_names_no_generator_reads_the_trees_own_cache() {
        let (_directory, root) = root("cmake-multiconfig-cache");
        fs::write(root.join("out/dev").join(CMAKE_CACHE), VS_CACHE).expect("cache");

        let computed = plan(&root, BuildProfile::Release);

        assert!(
            !computed
                .configure
                .iter()
                .any(|arg| arg.starts_with("-DCMAKE_BUILD_TYPE")),
            "a multi-config tree never gets a build type: {:?}",
            computed.configure
        );
        assert!(
            names(&computed.build, "--config", "Release"),
            "the configuration belongs on the build line: {:?}",
            computed.build
        );
        assert_eq!(computed.intent.build_type, None);
        assert!(
            computed.note.unwrap_or_default().is_empty(),
            "nothing had to be forced, so nothing is reported"
        );
    }

    #[test]
    fn a_preset_that_names_no_generator_and_a_tree_with_no_cache_reads_the_reply() {
        let (_directory, root) = root("cmake-multiconfig-reply");
        let reply = root.join("out/dev").join(".cmake/api/v1/reply");
        fs::create_dir_all(&reply).expect("reply directory");
        fs::write(reply.join("index-2026-11-13T06-01-10-0935.json"), VS_INDEX).expect("index");

        let computed = plan(&root, BuildProfile::Debug);

        assert!(
            !computed
                .configure
                .iter()
                .any(|arg| arg.starts_with("-DCMAKE_BUILD_TYPE")),
            "the reply said multiConfig, so no build type is forced: {:?}",
            computed.configure
        );
        assert!(
            names(&computed.build, "--config", "Debug"),
            "argv: {:?}",
            computed.build
        );
        assert_eq!(computed.intent.build_type, None);
    }

    #[test]
    fn a_single_config_tree_still_gets_the_profiles_build_type() {
        let (_directory, root) = root("cmake-multiconfig-single");
        fs::write(
            root.join("out/dev").join(CMAKE_CACHE),
            "CMAKE_GENERATOR:INTERNAL=Ninja\n",
        )
        .expect("cache");

        let computed = plan(&root, BuildProfile::RelWithDebInfo);

        assert!(
            computed
                .configure
                .contains(&"-DCMAKE_BUILD_TYPE=RelWithDebInfo".to_string()),
            "a single-config generator needs one at configure time: {:?}",
            computed.configure
        );
        assert_eq!(
            computed.intent.build_type,
            Some("RelWithDebInfo".to_string())
        );
    }
}
