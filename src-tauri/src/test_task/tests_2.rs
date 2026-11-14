#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{ProjectKind, TestItem, TestReport};
pub use std::io::{BufRead, BufReader, Read};
pub use std::process::{ExitStatus, Stdio};
pub use std::sync::{Arc, Mutex};
pub use std::thread;
pub use std::time::{Duration, Instant};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_2 {
    use super::*;

    /// Cargo chatter, a test listed before any header, a duplicated name, a bench line and an inner
    /// `::` both appear; the header re-points the binary for the names after it.
    pub const LIST_FIXTURE: &str = concat!(
        "    Finished `test` profile [unoptimized + debuginfo] target(s) in 1.02s\n",
        "prelude::tests::before_any_header: test\n",
        "     Running unittests src/lib.rs (target/debug/deps/quarry_lib-abc123)\n",
        "protocol_pipe::tests::roundtrip: test\n",
        "protocol_pipe::benches::throughput: bench\n",
        "protocol_pipe::tests::roundtrip: test\n",
        "build_task::tests::inner::helper: test\n",
        "suffix::tests::not_a_test: test extra\n",
        "not a test line at all\n",
    );

    #[test]
    pub fn only_cargo_projects_are_supported() {
        assert!(require_cargo(ProjectKind::Cargo).is_ok());

        for (kind, label) in [
            (ProjectKind::Cmake, "CMake"),
            (ProjectKind::CompileCommands, "compile_commands.json"),
            (ProjectKind::Unknown, "no build system"),
        ] {
            let error = require_cargo(kind).expect_err("non-Cargo kinds are not wired");
            assert!(error.contains(label), "unexpected error: {error}");
            assert!(
                error.contains("Cargo projects"),
                "unexpected error: {error}"
            );
        }
    }

    #[test]
    pub fn test_binaries_read_test_targets_only_and_label_by_source() {
        let stdout = [
            r#"{"reason":"compiler-artifact","profile":{"test":true},"target":{"name":"parity","src_path":"/p/demo/tests/parity.rs"},"executable":"/p/demo/target/debug/deps/parity-abc"}"#,
            r#"{"reason":"compiler-artifact","profile":{"test":false},"target":{"name":"serde","src_path":"/r/serde/src/lib.rs"},"executable":null}"#,
            r#"{"reason":"build-finished","success":true}"#,
            "cargo prints prose too",
            r#"{"reason":"compiler-artifact","profile":{"test":true},"target":{"name":"parity_cargo_tests","src_path":"/p/demo/src/lib.rs"},"executable":"/p/demo/target/debug/deps/parity_cargo_tests-def"}"#,
            r#"{"reason":"compiler-artifact","profile":{"test":true},"target":{"name":"parity_again","src_path":"/p/demo/tests/parity.rs"},"executable":"/p/demo/target/debug/deps/parity-abc"}"#,
        ]
        .join("\n");

        let binaries = test_binaries(&stdout, "/p/demo");

        let labels: Vec<&str> = binaries.iter().map(|one| one.label.as_str()).collect();
        assert_eq!(labels, ["src/lib.rs", "tests/parity.rs"]);
        assert_eq!(
            binaries[1].executable,
            "/p/demo/target/debug/deps/parity-abc"
        );
    }

    #[test]
    pub fn a_windows_root_and_a_verbatim_one_label_the_same_target() {
        let artifact = r#"{"reason":"compiler-artifact","profile":{"test":true},"target":{"src_path":"C:\\work\\demo\\tests\\parity.rs"},"executable":"C:\\work\\demo\\target\\debug\\deps\\parity.exe"}"#;

        for root in [r"C:\work\demo", r"\\?\C:\work\demo"] {
            let binaries = test_binaries(artifact, root);
            assert_eq!(binaries.len(), 1, "root {root} answered nothing");
            assert_eq!(binaries[0].label, "tests/parity.rs");
        }
    }

    #[test]
    pub fn a_source_outside_the_root_keeps_its_whole_path() {
        assert_eq!(
            source_label("/p/demo", "/p/other/tests/parity.rs"),
            "/p/other/tests/parity.rs"
        );
        assert_eq!(
            source_label("/p/demo", "/p/demoish/src/lib.rs"),
            "/p/demoish/src/lib.rs"
        );
    }

    #[test]
    pub fn a_per_binary_listing_is_labelled_with_that_binary() {
        let items = parse_tests("adds_two_and_three: test\n", "tests/parity.rs");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].binary, "tests/parity.rs");
        assert_eq!(items[0].name, "adds_two_and_three");
    }
}
