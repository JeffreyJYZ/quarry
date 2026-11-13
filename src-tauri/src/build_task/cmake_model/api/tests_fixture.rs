#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

#[cfg(all(test, unix))]
use super::fixture_project;
use super::*;

/// A real Ninja Multi-Config configure, because a captured reply only proves the parser.
#[cfg(all(test, unix))]
#[allow(dead_code)]
pub mod cmake_api_fixture {
    use super::fixture_project::*;
    use super::*;
    use crate::build_task::*;

    #[test]
    pub fn a_multi_config_generator_gets_a_database_from_the_file_api() {
        let Some((_directory, root)) = project("cmake-api-ninja-multi") else {
            return;
        };
        let build = root.join("build");

        write_query(&build).expect("the build writes the query before configuring");
        assert!(
            build
                .join(API_DIR)
                .join("query")
                .join(QUERY_CLIENT)
                .join(QUERY_FILE)
                .is_file(),
            "the query sits where CMake polls for it"
        );
        assert!(configure(&root, &build), "the fixture project configures");
        assert!(
            !build.join(DATABASE_FILE).is_file(),
            "Ninja Multi-Config writes no compile_commands.json, which is the gap this fills"
        );

        let synthesis = synthesize_database(&build)
            .expect("the reply reads")
            .expect("the fallback database is written");
        assert!(synthesis.files >= 2, "every source of every configuration");
        let entries: Vec<CompileEntry> =
            serde_json::from_str(&fs::read_to_string(build.join(DATABASE_FILE)).expect("database"))
                .expect("database JSON");
        let debug_main = entries
            .iter()
            .find(|entry| {
                entry.file.ends_with("main.cpp")
                    && entry.arguments.iter().any(|token| token == "-g")
            })
            .expect("the Debug entry of main.cpp");
        assert!(
            debug_main
                .arguments
                .windows(2)
                .any(|pair| pair[0] == "-I" && pair[1].ends_with("include")),
            "the target's include directory is a flag: {:?}",
            debug_main.arguments
        );
        assert!(
            debug_main.arguments.contains(&"-DDEMO_FLAG=1".to_string()),
            "the target's define is a flag: {:?}",
            debug_main.arguments
        );
        assert!(
            entries.iter().any(|entry| entry.file.ends_with("main.cpp")
                && entry.arguments.iter().any(|token| token == "-O3")),
            "the Release configuration carries its own flags"
        );
    }

    #[test]
    pub fn the_run_targets_are_the_targets_the_build_system_names() {
        let Some((_directory, root)) = project("cmake-api-targets") else {
            return;
        };
        let build = root.join("build");
        write_query(&build).expect("query");
        assert!(configure(&root, &build), "the fixture project configures");

        let model = read_codemodel(&build).expect("the reply reads");
        let debug = model.configuration("Debug").expect("Debug is reported");
        let names = debug
            .targets
            .iter()
            .map(|target| target.name.clone())
            .collect::<Vec<String>>();
        assert_eq!(
            names,
            vec![
                "demo_app".to_string(),
                "helper".to_string(),
                "tool".to_string()
            ],
            "the project's own targets, including one whose name differs from the project"
        );

        let help = help_targets(&build);
        for name in &names {
            assert!(
                help.contains(name),
                "{name} is a target the build system names: {help:?}"
            );
        }

        let executables = cmake_run_targets(&build)
            .into_iter()
            .map(|(name, _)| name)
            .collect::<Vec<String>>();
        assert_eq!(
            executables,
            vec!["demo_app".to_string(), "tool".to_string()]
        );
    }

    #[test]
    pub fn a_failing_configure_leaves_no_synthesized_database_behind() {
        let Some((_directory, root)) = project("cmake-api-failing") else {
            return;
        };
        fs::write(
            root.join("CMakeLists.txt"),
            "cmake_minimum_required(VERSION 3.20)\n\
             project(demo CXX)\n\
             message(FATAL_ERROR \"this project refuses to configure\")\n",
        )
        .expect("manifest");

        let report = run_cmake_build(
            &BuildState::default(),
            &root.display().to_string(),
            false,
            None,
        )
        .expect("cmake is runnable");

        assert!(!report.success, "the configure failed: {}", report.summary);
        assert!(
            !root.join(BUILD_DIR).join(DATABASE_FILE).is_file(),
            "no database is written from a configure that never produced a model"
        );
    }
}
