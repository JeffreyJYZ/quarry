//! Test discovery and single-test runs.
//!
//! Two suites share one dock. Cargo discovery runs `cargo test -- --list --format terse` in the
//! project's build root and parses the `path::name: test` lines; each name takes the test binary
//! from the closest preceding `Running …` header, or the crate name when no header was seen.
//! GoogleTest discovery asks a program the project's run configurations name for
//! `--gtest_list_tests`, and one case runs as `--gtest_filter=Suite.Case`.
//!
//! Neither command builds ahead of time, so either may compile: a discovery run is killed after
//! `LIST_TIMEOUT` (cargo) or `GTEST_LIST_TIMEOUT` (gtest), and a test run after `RUN_TIMEOUT`.
//! A failing test, or a non-zero exit that still produced parseable output, is a result rather
//! than a command error. Nothing is written to disk.

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

mod tests_1;
pub use tests_1::*;

mod tests_2;
pub use tests_2::*;

mod tests_3;
pub use tests_3::*;
