//! The files a project can use to state its own compile flags.
//!
//! clangd reads both of them itself: `compile_flags.txt` is its fallback database, and `.clangd` is
//! its own configuration (whose `CompileFlags` are applied on top of whatever it finds). A database
//! of ours would take precedence over the first and add a second description to the second, so a
//! project holding either keeps it: nothing is synthesised, and the build keeps the flags it had.

#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// The fallback compile command clangd reads when no database answers for a file.
pub const COMPILE_FLAGS_FILE: &str = "compile_flags.txt";

/// clangd's own per-project configuration file.
pub const CLANGD_CONFIG: &str = ".clangd";

/// Every file a project can state its analysis flags in, nearest answer first.
pub const INSTRUCTION_FILES: [&str; 2] = [COMPILE_FLAGS_FILE, CLANGD_CONFIG];

/// The user's own instruction, when the project has one, named for the note that explains the skip.
pub fn own_instruction(root: &Path) -> Option<&'static str> {
    INSTRUCTION_FILES
        .into_iter()
        .find(|file| root.join(file).is_file())
}
