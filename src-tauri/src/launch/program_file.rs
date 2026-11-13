//! The file name a target's program has on this platform.
//!
//! Windows appends `.exe` to every executable, and a candidate path without it names nothing a
//! user can launch: the fallback that prefills Run before the first build must carry the suffix the
//! build will write, and the conventional layout search must look for the same file.

#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

/// The name a program is written under, given its target name.
pub fn program_file(name: &str) -> String {
    format!("{name}{}", std::env::consts::EXE_SUFFIX)
}
