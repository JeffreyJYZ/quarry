#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

/// CMake's cache: the file a configured tree records its own compiler in.
pub const CMAKE_CACHE: &str = "CMakeCache.txt";

/// The cache variables that name a compiler, the C++ one first because it is the sharper answer.
pub const CACHE_COMPILERS: [&str; 2] = ["CMAKE_CXX_COMPILER", "CMAKE_C_COMPILER"];

/// The compiler each cache variable names, in [`CACHE_COMPILERS`] order, when that file exists.
///
/// Only the values are read here: whether one names a real compiler is [`tree_drivers`]'s question,
/// because a cache may name a launcher (`ccache` as `CMAKE_CXX_COMPILER`) just as a database may.
pub fn cache_values(build_root: &Path) -> Vec<Option<String>> {
    let Ok(text) = fs::read_to_string(build_root.join(CMAKE_CACHE)) else {
        return vec![None; CACHE_COMPILERS.len()];
    };
    CACHE_COMPILERS
        .iter()
        .map(|key| cache_value(&text, key))
        .collect()
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
