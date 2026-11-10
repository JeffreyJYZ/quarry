#![allow(unused_imports)]

pub use std::fs;

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_3 {
    use super::*;
    use crate::test_support::TempDir;

    /// A C++ project that configures no program is told so, not shown an empty list.
    #[test]
    pub fn a_cpp_project_with_no_configured_program_gets_a_note() {
        let dir = TempDir::new("dispatch-note");
        fs::write(
            dir.path().join("CMakeLists.txt"),
            "cmake_minimum_required(VERSION 3.20)\nproject(demo)\n",
        )
        .expect("cmake marker");

        let discovery =
            crate::test_task::dispatch::list(&dir.path().display().to_string()).expect("discovery");

        assert!(discovery.items.is_empty());
        assert!(discovery.program.is_none());
        assert!(
            discovery
                .notes
                .iter()
                .any(|note| note.contains("no run configuration names a program")),
            "unexpected notes: {:?}",
            discovery.notes
        );
    }
}
