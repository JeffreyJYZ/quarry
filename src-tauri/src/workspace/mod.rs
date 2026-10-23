//! Filesystem reads and writes for the project tree and the editor.
//!
//! Lists exactly one directory level, never recurses, never follows symlinked directories,
//! directories first then files, case-insensitive by name. Reads a file as UTF-8 text, refusing
//! anything above the size cap. Writes a file through a sibling temporary file and a rename, so a
//! half-written file is never visible.

#![allow(unused_imports)]
pub(crate) use crate::ignore;
pub(crate) use crate::types::FileEntry;
pub use std::fs;
pub use std::fs::OpenOptions;
pub use std::io::Write;
#[cfg(unix)]
pub use std::os::unix::fs::PermissionsExt;
pub use std::path::Path;
pub use std::sync::atomic::{AtomicU64, Ordering};

mod max_text_bytes;
pub use max_text_bytes::*;

mod fill_temp_file;
pub use fill_temp_file::*;

mod tests_1;
pub use tests_1::*;

mod tests_group_1;
pub use tests_group_1::*;

mod tests_2;
pub use tests_2::*;
