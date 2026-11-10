//! Filesystem reads and writes for the project tree and the editor.
//!
//! Lists exactly one directory level, never recurses, never follows symlinked directories,
//! directories first then files, case-insensitive by name. Reads a file as text in the encoding it
//! is in — UTF-8, UTF-16 by its mark, or GB18030 — and reports which, refusing anything above the
//! size cap. Writes a file back in that same encoding, through a sibling temporary file and a
//! rename, so a half-written file is never visible and a legacy file is never converted to UTF-8.

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

mod roots;
pub use roots::*;

mod encoding;
pub use encoding::*;

#[cfg(test)]
mod encoding_tests;

mod roots_tests;
pub use roots_tests::*;

mod tests_1;
pub use tests_1::*;

mod tests_group_1;
pub use tests_group_1::*;

mod tests_2;
pub use tests_2::*;
