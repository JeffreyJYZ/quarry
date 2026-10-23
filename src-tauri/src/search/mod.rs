//! Project-wide text search.
//!
//! Runs `rg --json` over the project root, parses its match records into `SearchMatch` and honours a
//! result cap. Never spawns a shell: every argument is passed separately, so the query is never
//! interpreted. `target/`, `node_modules/` and `.git/` are excluded, so a build tree cannot flood the
//! result list.

#![allow(unused_imports)]
pub(crate) use crate::ignore;
pub(crate) use crate::types::{SearchMatch, SearchReport};
pub use regex::RegexBuilder;
pub use serde_json::Value;
pub use std::env;
pub use std::fs;
pub use std::io::{BufRead, BufReader, Read};
pub use std::path::{Path, PathBuf};
pub use std::process::{Child, Command, ExitStatus, Stdio};
pub use std::thread::{self, JoinHandle};
pub use std::time::Instant;

mod default_max_results;
pub use default_max_results::*;

mod search_core;
pub use search_core::*;

mod parse_match_line;
pub use parse_match_line::*;

mod tests_1;
pub use tests_1::*;

mod tests_2;
pub use tests_2::*;
