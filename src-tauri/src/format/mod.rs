//! Formatting through the project's own formatters.
//!
//! `rustfmt` for Rust, `clang-format` for C/C++. The source arrives as text and is fed on stdin, so a
//! document never has to be written to disk to be formatted; `path` only selects the formatter and
//! supplies `-assume-filename`. The binary is resolved `PATH` first and then through `xcrun`, matching
//! the toolchain probe: `clang-format` ships inside Xcode and nothing is bundled.
//!
//! A formatter failure is a command error carrying the formatter's own first stderr line; the file on
//! disk is untouched either way.

#![allow(unused_imports)]
pub use std::env;
pub use std::fs;
pub use std::io::Write;
pub use std::path::Path;
pub use std::process::{Command, Stdio};
pub use std::thread;

mod max_input_bytes;
pub use max_input_bytes::*;

mod parse_edition_value;
pub use parse_edition_value::*;

mod run;
pub use run::*;

mod tool_search;
pub use tool_search::*;

mod tests_1;
pub use tests_1::*;

mod tests_2;
pub use tests_2::*;
