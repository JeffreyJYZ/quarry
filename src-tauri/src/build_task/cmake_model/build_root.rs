//! Which directory a CMake project builds in.
//!
//! A tree that is already configured is the truth about where it builds: CLion writes
//! `cmake-build-debug`, a plain `cmake -B build` writes `build`, and `cmake -B .` writes beside the
//! manifest. Quarry therefore looks for CMake's own markers before it invents a directory, so an
//! existing tree wins over a new one and the artifact lands where the project expects it.
//!
//! The order is: the user's setting, a configure preset's binary directory (the project declaring
//! its own answer), the project root for an in-source build, then the conventional names, then
//! `<root>/build`.

#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// CMake's cache: written by configure, so its presence is what "already configured" means.
pub const CMAKE_CACHE: &str = "CMakeCache.txt";

/// CMake's generated-file directory; present once configure has run, cache or not.
pub const CMAKE_FILES_DIR: &str = "CMakeFiles";

/// The compiler database; a tree that only holds this was configured by something else.
pub const COMPILE_DATABASE: &str = "compile_commands.json";

/// Directory a CMake build falls back to when nothing on disk says otherwise.
pub const BUILD_DIR: &str = "build";

/// Directory quarry's own plain-clang build writes, relative to the project root.
pub const QUARRY_BUILD_DIR: &str = ".quarry/build";

/// Out-of-source directories CLion creates by convention.
pub const CLION_BUILD_DIRS: [&str; 2] = ["cmake-build-debug", "cmake-build-release"];

/// Resolve a settings value against the project root; an absolute value is already the answer.
pub fn absolute(root: &Path, value: &str) -> PathBuf {
    let path = Path::new(value);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        root.join(path)
    }
}

/// Whether CMake has already configured this directory.
pub fn is_configured(dir: &Path) -> bool {
    dir.join(CMAKE_CACHE).is_file()
        || dir.join(CMAKE_FILES_DIR).is_dir()
        || dir.join(COMPILE_DATABASE).is_file()
}

/// The directories to inspect, most specific first, without repeats.
pub fn candidates(root: &Path, preset_binary: Option<&Path>) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(dir) = preset_binary {
        push_unique(&mut dirs, dir.to_path_buf());
    }
    push_unique(&mut dirs, root.to_path_buf());
    push_unique(&mut dirs, root.join(BUILD_DIR));
    push_unique(&mut dirs, root.join(QUARRY_BUILD_DIR));
    for name in CLION_BUILD_DIRS {
        push_unique(&mut dirs, root.join(name));
    }
    dirs
}

fn push_unique(dirs: &mut Vec<PathBuf>, dir: PathBuf) {
    if !dirs.contains(&dir) {
        dirs.push(dir);
    }
}

/// The directory this project builds in.
///
/// A directory the user named always wins, then the first candidate CMake has already configured,
/// then the preset's binary directory, then `<root>/build`. Never touches the disk beyond reading.
pub fn resolve(root: &Path, options: &CmakeOptions, preset_binary: Option<&Path>) -> PathBuf {
    if let Some(dir) = options.build_dir_path(root) {
        return dir;
    }
    if let Some(found) = candidates(root, preset_binary)
        .into_iter()
        .find(|dir| is_configured(dir))
    {
        return found;
    }
    preset_binary
        .map(Path::to_path_buf)
        .unwrap_or_else(|| root.join(BUILD_DIR))
}

/// The build root detection picks, and the preset that decided it.
///
/// A launch composition needs the same directory a build writes into, before any build exists, so
/// this is the one place the choice is made outside [`super::cmake_plan`].
pub fn detect_build_root(root: &Path, options: &CmakeOptions) -> (PathBuf, Option<String>) {
    let presets = preset::load(root);
    let selected = select_configure(&presets, &options.preset).ok().flatten();
    let binary = selected.as_ref().and_then(|name| {
        preset_resolve::resolve_configure(&presets, name, root)
            .ok()
            .map(|resolved| preset_resolve::preset_binary(&resolved, root))
    });
    (resolve(root, options, binary.as_deref()), selected)
}
