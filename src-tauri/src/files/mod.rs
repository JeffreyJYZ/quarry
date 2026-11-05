//! Fast file listing for quick-open.
//!
//! Contract: list project files once, honour the same ignore set as search, and never walk into an
//! ignored directory or list an ignored file — `crate::ignore` is the one list both read.

#![allow(unused_imports)]
/// Directories that are never descended into (shared with the rest of the crate).
pub(crate) use crate::ignore;
pub use std::fs;
pub use std::path::{Path, PathBuf};

mod max_files;
pub use max_files::*;

mod rename_path;
pub use rename_path::*;

mod tests_items;
pub use tests_items::*;

mod file_ops_tests_items;
pub use file_ops_tests_items::*;
