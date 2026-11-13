//! The files whose content decides what a CMake configure produces.
//!
//! The manifest, its presets, anything the manifest `include`s or enters with `add_subdirectory`,
//! and the toolchain a configure was given. Which of those exist beyond the root is a fact only the
//! last configure knows: the reply's `cmakeFiles` object names every CMake file it read, so a
//! manifest three levels down is an input and a directory the project never entered is not. A tree
//! with no reply — the first build of a directory, or one configured by a CMake too old for the API
//! — is scanned instead, bounded by [`SCAN_DEPTH`].

#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// Preset files whose change re-describes the whole tree.
pub const PRESET_FILES: [&str; 2] = [PRESETS_FILE, USER_PRESETS_FILE];

/// The manifest every CMake tree has at its root.
pub const MANIFEST: &str = "CMakeLists.txt";

/// Levels below the source root the fallback scan descends; the reply is exact where it exists.
pub const SCAN_DEPTH: usize = 3;

/// The cache entry naming the toolchain a tree was configured with.
pub const TOOLCHAIN_VARIABLE: &str = "CMAKE_TOOLCHAIN_FILE";

/// Every file whose content decides what a configure produces.
pub fn model_inputs(
    source_root: &Path,
    build_root: &Path,
    toolchain: Option<&Path>,
) -> Vec<PathBuf> {
    let mut inputs: Vec<PathBuf> = Vec::new();
    for name in PRESET_FILES {
        push_existing(&mut inputs, source_root.join(name));
    }
    push_existing(&mut inputs, source_root.join(MANIFEST));
    let known = reply_inputs(source_root, build_root);
    if known.is_empty() {
        collect_manifests(source_root, 0, &mut inputs);
    }
    for path in known {
        push_existing(&mut inputs, path);
    }
    match toolchain {
        Some(path) => push_existing(&mut inputs, path.to_path_buf()),
        None => {
            if let Some(value) = cache_value(build_root, TOOLCHAIN_VARIABLE) {
                push_existing(&mut inputs, resolve_input(source_root, Path::new(&value)));
            }
        }
    }
    inputs
}

/// One cache variable's value, or `None` when the tree has no cache or no such entry.
pub fn cache_value(build_root: &Path, key: &str) -> Option<String> {
    let text = fs::read_to_string(build_root.join(CMAKE_CACHE)).ok()?;
    text.lines().find_map(|line| {
        let (name, value) = line.split_once('=')?;
        let name = name.split(':').next().unwrap_or(name);
        (name == key).then(|| value.trim().to_string())
    })
}

/// A path from a reply or a cache entry, resolved against the tree it belongs to.
pub fn resolve_input(base: &Path, path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        base.join(path)
    }
}

/// The CMake files the last configure read, from the reply that recorded them.
fn reply_inputs(source_root: &Path, build_root: &Path) -> Vec<PathBuf> {
    let Ok(value) = read_object(build_root, CMAKEFILES_KIND) else {
        return Vec::new();
    };
    value["inputs"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default()
        .iter()
        .filter_map(|input| input["path"].as_str())
        .map(|path| resolve_input(source_root, Path::new(path)))
        .collect()
}

fn collect_manifests(dir: &Path, depth: usize, inputs: &mut Vec<PathBuf>) {
    push_existing(inputs, dir.join(MANIFEST));
    if depth >= SCAN_DEPTH {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if crate::ignore::is_dir(&name) {
            continue;
        }
        collect_manifests(&path, depth + 1, inputs);
    }
}

fn push_existing(inputs: &mut Vec<PathBuf>, path: PathBuf) {
    if path.is_file() && !inputs.contains(&path) {
        inputs.push(path);
    }
}
