#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// What a tree that names no generator can still say: which generator CMake will pick, and whether
/// the build type the plan passes is one that generator uses. Such a tree keeps the type (a
/// single-config generator without one compiles no debug info), carries the configuration on the
/// build, and reports that the generator is CMake's to choose.
#[cfg(test)]
#[allow(dead_code)]
pub mod tests_cmake_first_configure {
    use super::*;
    use crate::test_support::TempDir;

    const VS_GENERATOR: &str = "Visual Studio 17 2022";

    /// The cache of a multi-config tree that was told a build type it never uses.
    const LEAKED_CACHE: &str = "CMAKE_GENERATOR:INTERNAL=Visual Studio 17 2022\n\
                                CMAKE_BUILD_TYPE:UNINITIALIZED=Debug\n";

    fn project(tag: &str) -> (TempDir, PathBuf) {
        let directory = TempDir::new(tag);
        let path = directory.path().canonicalize().expect("canonical root");
        fs::write(path.join(MANIFEST), "project(demo CXX)\n").expect("manifest");
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

    fn typed(argv: &[String]) -> bool {
        argv.iter().any(|arg| arg.starts_with("-DCMAKE_BUILD_TYPE"))
    }

    #[test]
    fn a_tree_with_no_evidence_asks_for_the_configuration_it_will_build() {
        let (_directory, root) = project("first-configure-empty");
        let computed = plan(&root, BuildProfile::RelWithDebInfo);

        assert_eq!(
            computed.generator, None,
            "nothing on disk names a generator, and the plan says so instead of inventing one"
        );
        assert!(
            names(&computed.build, "--config", "RelWithDebInfo"),
            "the build names the configuration either way: {:?}",
            computed.build
        );
        assert_eq!(
            computed.intent.build_type,
            Some("RelWithDebInfo".to_string()),
            "a single-config generator needs the type at configure time, and this tree has not said which it is"
        );
        assert!(
            typed(&computed.configure),
            "the type is kept for debug info: {:?}",
            computed.configure
        );
        let note = computed.note.expect("the choice of generator is reported");
        assert!(note.contains("cmake picks one"), "note: {note}");
        assert!(note.contains("-DCMAKE_BUILD_TYPE=RelWithDebInfo"), "{note}");
        assert!(note.contains("--config RelWithDebInfo"), "{note}");
    }

    #[test]
    fn a_preset_named_generator_wins_over_the_tree_it_describes() {
        let (_directory, root) = project("first-configure-preset-multi");
        fs::write(
            root.join(PRESETS_FILE),
            r#"{ "version": 6, "configurePresets": [ {
                "name": "dev", "generator": "Ninja Multi-Config",
                "binaryDir": "${sourceDir}/out/dev"
            } ] }"#,
        )
        .expect("presets");
        let build = root.join("out").join("dev");
        fs::create_dir_all(&build).expect("preset tree");
        fs::write(
            build.join(CMAKE_CACHE),
            "CMAKE_GENERATOR:INTERNAL=Unix Makefiles\n",
        )
        .expect("cache");

        let computed = plan(&root, BuildProfile::Release);

        assert_eq!(
            computed.generator.as_deref(),
            Some("Ninja Multi-Config"),
            "the preset names the generator, so the tree's older cache does not"
        );
        assert!(
            !typed(&computed.configure),
            "the preset's generator takes no build type: {:?}",
            computed.configure
        );
        assert!(
            names(&computed.build, "--config", "Release"),
            "{:?}",
            computed.build
        );
        assert_eq!(computed.note, None, "the preset said so; nothing to report");
    }

    #[test]
    fn a_single_config_tree_keeps_the_type_its_generator_uses() {
        let (_directory, root) = project("first-configure-single");
        let build = root.join(BUILD_DIR);
        fs::create_dir_all(&build).expect("build dir");
        fs::write(
            build.join(CMAKE_CACHE),
            "CMAKE_GENERATOR:INTERNAL=Unix Makefiles\nCMAKE_BUILD_TYPE:STRING=Debug\n",
        )
        .expect("cache");

        let computed = plan(&root, BuildProfile::Release);

        assert_eq!(computed.generator.as_deref(), Some("Unix Makefiles"));
        assert!(
            computed
                .configure
                .contains(&"-DCMAKE_BUILD_TYPE=Release".to_string()),
            "a single-config generator needs the type: {:?}",
            computed.configure
        );
        assert_eq!(
            computed.intent,
            ConfigureIntent {
                toolchain: None,
                build_type: Some("Release".to_string()),
            },
            "the tree reports its generator, so nothing is guessed"
        );
        assert_eq!(computed.note, None, "the tree's own cache answered it");
    }

    #[test]
    fn a_multi_config_tree_never_receives_a_build_type() {
        let (_directory, root) = project("first-configure-multi");
        let build = root.join(BUILD_DIR);
        fs::create_dir_all(&build).expect("build dir");
        fs::write(build.join(CMAKE_CACHE), LEAKED_CACHE).expect("cache");

        let computed = plan(&root, BuildProfile::Debug);

        assert_eq!(computed.generator.as_deref(), Some(VS_GENERATOR));
        assert!(
            !typed(&computed.configure),
            "a multi-config generator is never passed a build type: {:?}",
            computed.configure
        );
        assert_eq!(computed.intent.build_type, None);
        assert!(
            names(&computed.build, "--config", "Debug"),
            "the configuration travels on the build: {:?}",
            computed.build
        );
        assert_eq!(
            computed.note, None,
            "the generator's own rule needed no note"
        );
    }

    #[test]
    fn a_value_the_generator_ignores_is_reported_not_removed() {
        let (_directory, root) = project("first-configure-leak");
        let build = root.join(BUILD_DIR);
        fs::create_dir_all(&build).expect("build dir");
        fs::write(build.join(CMAKE_CACHE), LEAKED_CACHE).expect("cache");

        let computed = plan(&root, BuildProfile::Debug);

        // The tree may be the user's own: the plan takes the value out of its own argv and leaves
        // the cache exactly as it found it, rather than rewriting a file it did not write.
        assert!(
            !names(&computed.configure, "-U", BUILD_TYPE_VARIABLE),
            "nothing in the user's tree is removed: {:?}",
            computed.configure
        );
        assert_eq!(
            fs::read_to_string(build.join(CMAKE_CACHE)).expect("cache"),
            LEAKED_CACHE,
            "the cache is the tree's own record and the plan only reads it"
        );
    }
}
