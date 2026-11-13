#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

/// The directory CMake keeps its own per-version compiler records in.
pub const RECORD_DIR: &str = "CMakeFiles";

/// CMake's own compiler records and the variable each states, the C++ one first.
///
/// The version directory holding them varies with the CMake that configured the tree, so the record
/// is found rather than named: a toolchain file that sets `CMAKE_CXX_COMPILER` before `project()`
/// leaves the cache with no compiler at all, while this record always states the one that was used.
pub const RECORDS: [(&str, &str); 2] = [
    ("CMakeCXXCompiler.cmake", "CMAKE_CXX_COMPILER"),
    ("CMakeCCompiler.cmake", "CMAKE_C_COMPILER"),
];

/// The compilers clangd should query for a configured tree, in CMake's own order of authority.
///
/// The record above is sharper than the cache: a preset or toolchain that selects a compiler still
/// records it there. The cache is the second answer, and the database the third — a tree written by
/// something other than CMake has only that, and it is read through any launcher in front of the
/// driver. No source is trusted to name a compiler: a launcher answers `--version` for itself and
/// teaches clangd nothing, so it is filtered out and the command line behind it is asked instead.
pub fn tree_drivers(build_root: &Path) -> Vec<String> {
    let records = record_compilers(build_root);
    let cached = cache_values(build_root);
    // Per compiler, the record first and the cache second: a toolchain file may name only the C++
    // one, and the C compiler it left to CMake is still the cache's to report.
    let named: Vec<String> = records
        .iter()
        .zip(&cached)
        .filter_map(|(record, cache)| record.clone().or_else(|| cache.clone()))
        .collect();
    let drivers = compilers(named);
    if !drivers.is_empty() {
        return drivers;
    }
    crate::project::compiler_drivers(&build_root.join(crate::project::DATABASE_FILE))
}

/// The compiler each record states, in [`RECORDS`] order; `None` for one the tree does not hold.
fn record_compilers(build_root: &Path) -> Vec<Option<String>> {
    let Ok(entries) = fs::read_dir(build_root.join(RECORD_DIR)) else {
        return vec![None; RECORDS.len()];
    };
    let mut versions: Vec<PathBuf> = entries
        .filter_map(|entry| Some(entry.ok()?.path()))
        .filter(|path| path.is_dir())
        .collect();
    versions.sort();
    RECORDS
        .iter()
        .map(|(file, key)| {
            versions
                .iter()
                .find_map(|version| record_value(&version.join(file), key))
        })
        .collect()
}

/// One variable's value in a compiler record, whose lines read `set(KEY "value")`.
fn record_value(file: &Path, key: &str) -> Option<String> {
    let text = fs::read_to_string(file).ok()?;
    let prefix = format!("set({key} ");
    let line = text
        .lines()
        .map(str::trim)
        .find(|line| line.starts_with(&prefix))?;
    let value = crate::project::unquote(line.strip_prefix(&prefix)?);
    (!value.is_empty()).then_some(value)
}

/// The named values that are real compilers: files that exist, deduplicated in the order named.
fn compilers(values: Vec<String>) -> Vec<String> {
    let mut drivers: Vec<String> = Vec::new();
    for value in values {
        if !Path::new(&value).is_file() || !crate::project::is_compiler(&value) {
            continue;
        }
        if !drivers.iter().any(|seen| seen == &value) {
            drivers.push(value);
        }
    }
    drivers
}
