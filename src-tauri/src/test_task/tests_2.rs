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
}
