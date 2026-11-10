#![allow(unused_imports)]

pub use std::fs;

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_2 {
    use super::*;
    use crate::test_support::TempDir;
    #[cfg(unix)]
    use crate::test_task::gtest::fixtures::script;
    use crate::test_task::gtest::fixtures::{launch, project as project_fixture};

    #[cfg(unix)]
    #[test]
    pub fn program_comes_from_the_preset_named_after_tests() {
        let dir = TempDir::new("gtest-pick");
        fs::create_dir_all(dir.path().join("build")).expect("build dir");
        script(dir.path(), "build/app", "exit 0");
        let tests = script(dir.path(), "build/tests", "exit 0");
        launch(
            dir.path(),
            &[("app", "./build/app"), ("unit tests", "./build/tests")],
        );
        let info = project_fixture(dir.path(), ProjectKind::Cmake);

        let program = program_for(&info).expect("a configured program");

        assert_eq!(program.preset, "unit tests");
        assert_eq!(program.path, tests);
    }

    #[test]
    pub fn a_project_without_a_program_says_so() {
        let dir = TempDir::new("gtest-noprogram");
        fs::create_dir_all(dir.path().join(".quarry")).expect("launch dir");
        fs::write(
            dir.path().join(".quarry").join("launch.json"),
            r#"{"configurations":[{"name":"app"}]}"#,
        )
        .expect("launch file");

        let error = program_for(&project_fixture(dir.path(), ProjectKind::Cmake))
            .expect_err("no program is configured");

        assert!(
            error.contains("no run configuration names a program"),
            "unexpected: {error}"
        );
    }

    #[test]
    pub fn a_relative_program_outside_the_root_is_refused() {
        let dir = TempDir::new("gtest-escape");
        launch(dir.path(), &[("tests", "../elsewhere/tests")]);

        let error = program_for(&project_fixture(dir.path(), ProjectKind::Cmake))
            .expect_err("a program outside the root");

        assert!(
            error.contains("outside the project root"),
            "unexpected: {error}"
        );
    }

    #[test]
    pub fn a_missing_program_is_named() {
        let dir = TempDir::new("gtest-missing");
        launch(dir.path(), &[("tests", "./build/tests")]);

        let error = program_for(&project_fixture(dir.path(), ProjectKind::Cmake))
            .expect_err("a program that was never built");

        assert!(error.contains("does not exist"), "unexpected: {error}");
        assert!(error.contains("build/tests"), "unexpected: {error}");
    }

    #[test]
    pub fn only_cpp_projects_or_test_named_presets_are_probed() {
        let dir = TempDir::new("gtest-probe");
        launch(dir.path(), &[("app", "./build/app")]);
        let cargo = project_fixture(dir.path(), ProjectKind::Cargo);

        assert!(!should_probe(&cargo));
        assert!(should_probe(&project_fixture(
            dir.path(),
            ProjectKind::Cmake
        )));
        assert!(!should_probe(&project_fixture(
            dir.path(),
            ProjectKind::Unknown
        )));

        launch(dir.path(), &[("tests", "./build/app")]);
        assert!(should_probe(&cargo));
    }
}
