#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

/// CMake's cache: the file a configured tree records its own compiler in.
pub const CMAKE_CACHE: &str = "CMakeCache.txt";

/// The cache variables that name a compiler, the C++ one first because it is the sharper answer.
pub const CACHE_COMPILERS: [&str; 2] = ["CMAKE_CXX_COMPILER", "CMAKE_C_COMPILER"];

/// The compilers the configured tree names in its own cache, when those files exist.
///
/// This is the tree's own answer rather than the database's: a preset or toolchain that selects a
/// compiler records it here, while a database entry may be a launcher (`ccache`, `sccache`) that
/// answers `--version` for itself and teaches clangd nothing.
pub fn cache_drivers(build_root: &Path) -> Vec<String> {
    let Ok(text) = fs::read_to_string(build_root.join(CMAKE_CACHE)) else {
        return Vec::new();
    };
    let mut drivers: Vec<String> = Vec::new();
    for key in CACHE_COMPILERS {
        let Some(value) = cache_value(&text, key) else {
            continue;
        };
        if !Path::new(&value).is_file() || drivers.iter().any(|seen| seen == &value) {
            continue;
        }
        drivers.push(value);
    }
    drivers
}

/// One variable's value in a `CMakeCache.txt` file, whose lines read `KEY:TYPE=value`.
fn cache_value(text: &str, key: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let (name, value) = line.split_once('=')?;
        let name = name.split(':').next().unwrap_or_default();
        if name != key {
            return None;
        }
        let value = value.trim();
        (!value.is_empty()).then(|| value.to_string())
    })
}
