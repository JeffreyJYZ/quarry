#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

#[cfg(test)]
pub mod tests {
    use crate::build_task::{BuildProfile, CmakeOptions, CmakePlan, cmake_plan};

    use super::support::*;
    use super::*;

    fn plan_for(fixture: &Fixture) -> CmakePlan {
        let root = fixture.root();
        cmake_plan(&root, BuildProfile::Debug, &CmakeOptions::for_root(&root))
            .expect("the project's own plan")
    }

    #[test]
    fn the_presets_binary_directory_is_named_when_it_holds_a_database() {
        let fixture = Fixture::new("preset-database");
        let info = fixture.preset_project();
        fixture.write("out/debug/compile_commands.json", "[]");

        let Handoff { args, database, .. } = handoff_for("clangd", &info, &[]);

        let expected = fixture.root().join("out/debug");
        assert_eq!(database, Some(expected.clone()));
        assert!(
            args.iter()
                .any(|arg| arg == &format!("{COMPILE_COMMANDS_DIR}={}", expected.display())),
            "the plan's own tree is the directory clangd reads: {args:?}"
        );
        assert!(
            !fixture.root().join("build").exists(),
            "a database the plan named is never copied into a guessed build directory"
        );
    }

    #[test]
    fn a_plan_named_tree_without_a_database_is_configured_there() {
        let fixture = Fixture::new("preset-configure");
        let info = fixture.preset_project();
        let expected = fixture.root().join("out/debug");

        let Handoff { args, database, .. } = handoff_for("clangd", &info, &[]);

        assert!(
            !fixture.root().join("build").exists(),
            "the hand-off must configure the plan's tree, not invent build/"
        );
        if cmake_available() {
            assert_eq!(database, Some(expected.clone()));
            assert!(
                args.iter()
                    .any(|arg| arg == &format!("{COMPILE_COMMANDS_DIR}={}", expected.display())),
                "{args:?}"
            );
        } else {
            assert_eq!(
                database, None,
                "no cmake means no database and a started session"
            );
        }
    }

    #[test]
    fn the_configure_argv_is_the_plans() {
        let fixture = Fixture::new("plan-argv");
        fixture.write("CMakeLists.txt", CMAKE_LISTS);
        fixture.write("CMakePresets.json", PRESETS);
        fixture.write("out/debug/CMakeCache.txt", "");
        let plan = plan_for(&fixture);
        assert_eq!(plan.build_root, fixture.root().join("out/debug"));

        let flags = configure_argv(&plan);

        assert!(flags.iter().any(|flag| flag == "--preset"), "{flags:?}");
        assert!(flags.iter().any(|flag| flag == "debug"), "{flags:?}");
        assert!(
            flags
                .iter()
                .any(|flag| flag == "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON"),
            "{flags:?}"
        );
        assert!(
            !flags.iter().any(|flag| flag.starts_with(BUILD_TYPE_FLAG)),
            "the preset carries its own build type: {flags:?}"
        );
    }

    #[test]
    fn a_tree_configured_for_the_same_profile_keeps_its_build_type() {
        let fixture = Fixture::new("recipe-argv");
        fixture.write("CMakeLists.txt", CMAKE_LISTS);
        fixture.write("build/CMakeCache.txt", "CMAKE_BUILD_TYPE:STRING=Debug\n");
        let plan = plan_for(&fixture);

        let flags = configure_argv(&plan);

        assert!(
            flags
                .iter()
                .any(|flag| flag == "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON"),
            "{flags:?}"
        );
        assert!(
            !flags.iter().any(|flag| flag.starts_with(BUILD_TYPE_FLAG)),
            "reconfiguring a tree for the profile it already uses must not touch its build type: {flags:?}"
        );
    }

    #[test]
    fn a_tree_configured_for_another_profile_is_given_the_plans_build_type() {
        let fixture = Fixture::new("recipe-profile");
        fixture.write("CMakeLists.txt", CMAKE_LISTS);
        fixture.write(
            "build/CMakeCache.txt",
            "CMAKE_BUILD_TYPE:STRING=RelWithDebInfo\n",
        );
        let plan = plan_for(&fixture);

        let flags = configure_argv(&plan);

        assert!(
            flags.iter().any(|flag| flag == "-DCMAKE_BUILD_TYPE=Debug"),
            "a tree configured for another profile is a genuine reconfigure: {flags:?}"
        );
    }

    #[test]
    fn a_multi_config_tree_is_never_asked_for_a_build_type() {
        let fixture = Fixture::new("multi-config-profile");
        fixture.write("CMakeLists.txt", CMAKE_LISTS);
        fixture.write(
            "build/CMakeCache.txt",
            "CMAKE_GENERATOR:INTERNAL=Ninja Multi-Config\nCMAKE_BUILD_TYPE:STRING=\n",
        );
        let plan = plan_for(&fixture);

        assert_eq!(
            wanted_build_type(&plan),
            None,
            "the generator takes it at build time"
        );
        assert!(!build_type_changed(&plan));
        let flags = configure_argv(&plan);
        assert!(
            !flags.iter().any(|flag| flag.starts_with(BUILD_TYPE_FLAG)),
            "{flags:?}"
        );
    }

    #[test]
    fn a_fresh_directory_keeps_the_build_type_the_plan_forces() {
        let fixture = Fixture::new("fresh-argv");
        fixture.write("CMakeLists.txt", CMAKE_LISTS);
        let plan = plan_for(&fixture);

        let flags = configure_argv(&plan);

        assert!(
            flags.iter().any(|flag| flag.starts_with(BUILD_TYPE_FLAG)),
            "a tree that has never been configured gets the plan's build type: {flags:?}"
        );
    }
}
