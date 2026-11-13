#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

#[cfg(test)]
pub mod tests {
    use super::support::*;
    use super::*;

    #[test]
    fn the_presets_binary_directory_is_named_when_it_holds_a_database() {
        let fixture = Fixture::new("preset-database");
        let info = fixture.preset_project();
        fixture.write("out/debug/compile_commands.json", "[]");

        let (args, database) = server_args("clangd", &info, &[]);

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

        let (args, database) = server_args("clangd", &info, &[]);

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
        let root = fixture.root();
        let build = root.join("out/debug");
        fixture.write("out/debug/CMakeCache.txt", "");

        let flags = configure_argv(&root, &build);

        assert!(flags.iter().any(|flag| flag == "--preset"), "{flags:?}");
        assert!(flags.iter().any(|flag| flag == "debug"), "{flags:?}");
        assert!(
            flags
                .iter()
                .any(|flag| flag == "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON"),
            "{flags:?}"
        );
        assert!(
            !flags
                .iter()
                .any(|flag| flag.starts_with("-DCMAKE_BUILD_TYPE=")),
            "the preset carries its own build type: {flags:?}"
        );
    }

    #[test]
    fn a_configured_tree_that_is_not_a_preset_keeps_its_build_type() {
        let fixture = Fixture::new("recipe-argv");
        fixture.write("CMakeLists.txt", CMAKE_LISTS);
        let root = fixture.root();
        let build = root.join("build");
        fixture.write("build/CMakeCache.txt", "");

        let flags = configure_argv(&root, &build);

        assert!(
            flags
                .iter()
                .any(|flag| flag == "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON"),
            "{flags:?}"
        );
        assert!(
            !flags
                .iter()
                .any(|flag| flag.starts_with("-DCMAKE_BUILD_TYPE=")),
            "reconfiguring an existing tree must not flip its build type: {flags:?}"
        );
    }
}
