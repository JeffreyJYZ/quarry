#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod targets_tests {
    use super::*;

    #[test]
    pub fn the_artifact_comes_from_the_codemodel_not_a_file_name_guess() {
        let directory = single("targets-single");

        let targets = cmake_run_targets(directory.path());

        assert_eq!(
            targets,
            vec![("demo".to_string(), PathBuf::from("/proj/build/demo"))],
            "the target's own artifact is the launch path"
        );
    }

    #[test]
    pub fn several_executables_are_listed_and_a_library_is_not_one() {
        let directory = multi("targets-multi");
        let model = read_codemodel(directory.path()).expect("the reply reads");

        let executables = executables(&model, PREFERRED_CONFIGURATION);
        assert_eq!(
            executables,
            vec![
                (
                    "demo_app".to_string(),
                    PathBuf::from("/proj/build/Debug/demo_app")
                ),
                ("tool".to_string(), PathBuf::from("/proj/build/Debug/tool")),
            ],
            "both executables, and only executables"
        );

        let libraries = libraries(&model, PREFERRED_CONFIGURATION);
        assert_eq!(
            libraries,
            vec![(
                "helper".to_string(),
                PathBuf::from("/proj/build/Debug/libhelper.a")
            )],
            "the library keeps its own artifact and is never a run target"
        );
    }

    #[test]
    pub fn the_active_configuration_is_debug_and_the_other_configurations_stay_readable() {
        let directory = multi("targets-active");
        let model = read_codemodel(directory.path()).expect("the reply reads");

        let active = model.active(PREFERRED_CONFIGURATION).expect("Debug");
        assert_eq!(active.name, "Debug");
        let release = model.configuration("Release").expect("Release");
        assert_eq!(
            release.targets[0].artifacts,
            vec![PathBuf::from("/proj/build/Release/demo_app")]
        );
    }

    #[test]
    pub fn a_target_built_only_in_release_still_names_the_binary_that_exists() {
        let directory = empty("targets-release-only");
        let release_binary = directory.path().join("Release").join("demo_app");
        fs::create_dir_all(release_binary.parent().expect("parent")).expect("release dir");
        fs::write(&release_binary, "binary").expect("built binary");

        let debug = Target {
            name: "demo_app".to_string(),
            kind: TargetKind::Executable,
            configuration: "Debug".to_string(),
            build_dir: directory.path().to_path_buf(),
            artifacts: vec![directory.path().join("Debug").join("demo_app")],
            groups: Vec::new(),
        };
        let release = Target {
            configuration: "Release".to_string(),
            artifacts: vec![release_binary.clone()],
            ..debug.clone()
        };
        let model = Codemodel {
            source_root: directory.path().to_path_buf(),
            build_root: directory.path().to_path_buf(),
            configurations: vec![
                Configuration {
                    name: "Debug".to_string(),
                    targets: vec![debug.clone()],
                },
                Configuration {
                    name: "Release".to_string(),
                    targets: vec![release],
                },
            ],
        };

        assert_eq!(
            target_artifact(&model, &debug),
            Some(release_binary),
            "an artifact a build actually wrote wins over the path it would write"
        );
    }

    #[test]
    pub fn a_tree_with_no_reply_offers_no_cmake_targets() {
        let directory = empty("targets-empty");

        assert!(
            cmake_run_targets(directory.path()).is_empty(),
            "the launch falls back to the conventional file-name search"
        );
    }
}
