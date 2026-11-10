//! GoogleTest support: list a configured gtest binary's cases and run one case.
//!
//! The program is never guessed: it comes from a preset in `.quarry/launch.json`, the same file the
//! Run tab edits. Discovery runs `<program> --gtest_list_tests` under `GTEST_LIST_TIMEOUT`, and the
//! output is the suite line ending in `.` followed by indented case names:
//!
//! ```text
//! MySuite.
//!   DoesSomething
//!   HandlesError
//! ```
//!
//! One case runs through the same capture path the Cargo runner uses, with
//! `--gtest_filter=Suite.Case`, so its report lands in the dock exactly where a Cargo result does.
//!
//! A name with no `::` and a `.` is a gtest case; a Cargo test name is a Rust path (`a::b`) and
//! can never contain a dot, so the two suites route without asking the frontend which one it meant.

#![allow(unused_imports)]
pub(crate) use crate::project;
pub(crate) use crate::run_config;
pub(crate) use crate::types::{LaunchPreset, ProjectInfo, TestItem, TestReport};
pub use std::path::{Path, PathBuf};
pub use std::time::{Duration, Instant};

use super::*;

mod parse;
pub use parse::*;

mod program;
pub use program::*;

mod list;
pub use list::*;

mod run;
pub use run::*;

#[cfg(test)]
mod fixtures;
#[cfg(test)]
pub use fixtures::*;

mod tests_1;
pub use tests_1::*;

mod tests_2;
pub use tests_2::*;

mod tests_3;
pub use tests_3::*;
