//! Test discovery and single-test runs.
//!
//! Discovery runs `cargo test -- --list --format terse` in the project's build root and parses the
//! `path::name: test` lines; each name takes the test binary from the closest preceding `Running …`
//! header, or the crate name when no header was seen. Running one test uses
//! `cargo test <name> -- --exact --nocapture`.
//!
//! Neither command builds ahead of time, so either may compile: a discovery run is killed after
//! `LIST_TIMEOUT` and a test run after `RUN_TIMEOUT`. A failing test, or a non-zero exit that still
//! produced parseable output, is a result rather than a command error. Nothing is written to disk.

#![allow(unused_imports)]
pub(crate) use crate::project;
pub(crate) use crate::types::{ProjectKind, TestItem, TestReport};
pub use std::io::{BufRead, BufReader, Read};
pub use std::process::{ExitStatus, Stdio};
pub use std::sync::{Arc, Mutex};
pub use std::thread;
pub use std::time::{Duration, Instant};

mod default_cargo;
pub use default_cargo::*;

mod capture;
pub use capture::*;

mod running_header;
pub use running_header::*;

mod tests_1;
pub use tests_1::*;

mod tests_2;
pub use tests_2::*;
