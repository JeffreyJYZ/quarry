//! Test discovery and single-test runs.
//!
//! Two suites share one dock. Cargo discovery runs `cargo test --no-run --message-format=json` in
//! the project's build root, which names each test target's source file and executable, and then
//! asks every executable for `--list --format terse`; each name is labelled with the binary's own
//! source path, so no stream merge can decide which file a case belongs to. GoogleTest discovery
//! asks a program the project's run configurations name for `--gtest_list_tests`, and one case runs
//! as `--gtest_filter=Suite.Case`.
//!
//! Neither builds ahead of a run: the discovery pass compiles, so it is killed after `LIST_TIMEOUT`
//! (cargo) plus `EXE_LIST_TIMEOUT` per binary, or `GTEST_LIST_TIMEOUT` (gtest), and a test run after
//! `RUN_TIMEOUT`. A failing test, or a non-zero exit that still produced parseable output, is a
//! result rather than a command error. Nothing is written to disk.

#![allow(unused_imports)]
pub(crate) use crate::project;
pub(crate) use crate::types::{ProjectKind, TestDiscovery, TestItem, TestReport};
pub use std::io::{BufRead, BufReader, Read};
pub use std::process::{Command, ExitStatus, Stdio};
pub use std::sync::{Arc, Mutex};
pub use std::thread;
pub use std::time::{Duration, Instant};

mod default_cargo;
pub use default_cargo::*;

mod dispatch;
pub use dispatch::*;

mod gtest;

mod capture;
pub use capture::*;

mod running_header;
pub use running_header::*;

mod targets;
pub use targets::*;

mod tests_1;
pub use tests_1::*;

mod tests_2;
pub use tests_2::*;

mod tests_3;
pub use tests_3::*;

/// Everything the dock's test tree holds, named once so a caller outside this module does not have
/// to know that `default_cargo::list` and `dispatch::list` share a bare name.
pub fn discover(root: &str) -> Result<TestDiscovery, String> {
    dispatch::list(root)
}

/// One case's report, routed exactly as the dock's Run button routes it.
pub fn run_case(root: &str, name: &str) -> Result<TestReport, String> {
    dispatch::run(root, name)
}
