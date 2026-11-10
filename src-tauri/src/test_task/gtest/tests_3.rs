#![allow(unused_imports)]

pub use std::fs;

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_3 {
    use super::*;
    use crate::test_support::TempDir;
    #[cfg(unix)]
    use crate::test_task::gtest::fixtures::script;
    use crate::test_task::gtest::fixtures::{launch, project as project_fixture};

    #[test]
    pub fn a_non_gtest_binary_is_reported() {
        let dir = TempDir::new("gtest-notgtest");
        let exe = std::env::current_exe()
            .expect("test binary")
            .display()
            .to_string();
        launch(dir.path(), &[("tests", &exe)]);

        let error = super::super::list_gtest(&project_fixture(dir.path(), ProjectKind::Cmake))
            .expect_err("the test harness is not a gtest binary");

        assert!(
            error.contains("not a GoogleTest binary"),
            "unexpected: {error}"
        );
        assert!(error.contains("--gtest_list_tests"), "unexpected: {error}");
    }

    #[cfg(unix)]
    #[test]
    pub fn a_successful_list_returns_cases() {
        let dir = TempDir::new("gtest-list");
        let path = script(dir.path(), "tests", r"printf 'MySuite.\n  Alpha\n  Beta\n'");
        launch(dir.path(), &[("tests", "./tests")]);
        let info = project_fixture(dir.path(), ProjectKind::Cmake);

        let found = super::super::list_gtest(&info).expect("a gtest binary");

        let names: Vec<&str> = found.items.iter().map(|item| item.name.as_str()).collect();
        assert_eq!(names, ["MySuite.Alpha", "MySuite.Beta"]);
        assert!(found.items.iter().all(|item| item.suite == "gtest"));
        assert!(
            found
                .items
                .iter()
                .all(|item| item.binary.ends_with("tests"))
        );
        assert_eq!(found.program, path.display().to_string());
        assert!(found.note.is_none());
    }

    #[cfg(unix)]
    #[test]
    pub fn an_empty_successful_list_says_the_program_reported_no_tests() {
        let dir = TempDir::new("gtest-empty");
        dir.file("tests", true);
        launch(dir.path(), &[("tests", "./tests")]);

        let found = super::super::list_gtest(&project_fixture(dir.path(), ProjectKind::Cmake))
            .expect("a program");

        assert!(found.items.is_empty());
        let note = found.note.expect("a sentence for the empty list");
        assert!(note.contains("reported no tests"), "unexpected: {note}");
    }

    #[cfg(unix)]
    #[test]
    pub fn a_program_that_never_exits_is_killed_and_reported() {
        let dir = TempDir::new("gtest-hang");
        let path = script(dir.path(), "hang", "exec sleep 30");
        let started = Instant::now();

        let error = capture_program(
            "list GoogleTest tests",
            &project::display(dir.path()),
            &project::display(&path),
            &["--gtest_list_tests"],
            Duration::from_millis(150),
        )
        .expect_err("a program that never exits");

        assert!(error.contains("timed out"), "unexpected: {error}");
        assert!(error.contains("was killed"), "unexpected: {error}");
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "the child was not killed: {:?}",
            started.elapsed()
        );
    }
}
