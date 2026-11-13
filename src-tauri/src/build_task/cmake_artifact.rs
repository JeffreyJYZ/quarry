#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::time::SystemTime;

use super::*;

/// The text CMake prints once a target is up to date: `[100%] Built target <name>`.
///
/// The percentage prefix differs by generator (Makefiles print `[100%]`, Ninja `[2/2]`), so only
/// the marker and the name that follows it are matched.
pub const BUILT_TARGET_MARKER: &str = "Built target ";

/// How deep the nested-layout search goes under the build root.
pub const TARGET_SEARCH_DEPTH: usize = 4;

/// Directories a multi-config generator inserts for its configuration.
pub const MULTI_CONFIG_DIRS: [&str; 4] = [
    CMAKE_CONFIG_DEBUG,
    CMAKE_CONFIG_RELEASE,
    "RelWithDebInfo",
    "MinSizeRel",
];

/// Every target this build printed, in the order it first printed it.
///
/// CMake names a target whether it rebuilt it or found it up to date, and it names libraries and
/// utility targets too, so this is a list of *candidates*, not executables. A target can appear
/// more than once across a build, so repeats are dropped here rather than by the resolver.
pub fn reported_targets(output: &str) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    for line in output.lines() {
        let Some((_, tail)) = line.split_once(BUILT_TARGET_MARKER) else {
            continue;
        };
        let name = tail.trim();
        if name.is_empty() || names.iter().any(|seen| seen == name) {
            continue;
        }
        names.push(name.to_string());
    }
    names
}

/// The program a reported target wrote, when one exists under `build_root`.
///
/// A file written at or after `written_since` is preferred over one that predates the build, and
/// the newest wins after that, because a multi-config build can hold the previous run's copy of the
/// same target beside the one it just wrote. A stale copy is still returned when it is the only
/// one: `cmake --build` prints `Built target` for a target it did not rebuild, and Run should still
/// launch it. `None` means the name resolves to no file, so the caller must not invent a path.
pub fn resolve_target(build_root: &Path, name: &str, written_since: SystemTime) -> Option<PathBuf> {
    let name = name.trim();
    if name.is_empty() || name.contains(['/', '\\']) {
        return None;
    }

    let mut found: Vec<(PathBuf, SystemTime)> = Vec::new();
    for path in layout_paths(build_root, name) {
        collect_program(&path, &mut found);
    }
    // `OUTPUT_NAME` and `RUNTIME_OUTPUT_DIRECTORY` rename or move the file, so the layouts above
    // name nothing that exists; the generated build tree records where the link step wrote it.
    if found.is_empty() {
        for path in target_output(build_root, name) {
            collect_program(&path, &mut found);
        }
    }
    // `add_subdirectory` keeps the source tree's shape, so the executable can sit anywhere below
    // the build root; the explicit layouts above cover the common cases without a walk.
    if found.is_empty() {
        walk_for_target(build_root, name, 0, &mut found);
    }
    prefer_written(&mut found, written_since);

    found.into_iter().next().map(|(path, _)| path)
}

/// The artifact Run launches for a CMake build.
///
/// The explicit layouts are checked first, then a bounded search for a nested one. Covered:
///
/// - `<build>/<name>` and `.exe` — Unix Makefiles / Ninja, single-config, top-level target.
/// - `<build>/<Config>/<name>` and `.exe` — Xcode, Visual Studio, Ninja Multi-Config.
/// - `<build>/<subdir>/<name>` and `<build>/<subdir>/<Config>/<name>` — `add_subdirectory`, which
///   finds the file by its exact name and ignores every other file.
/// - A name no layout matches: the path the target's own link command records, which is the only
///   place `OUTPUT_NAME` and `RUNTIME_OUTPUT_DIRECTORY` are written down.
///
/// A name that resolves feeds `choose_artifact` as the reported target, so a newer helper binary
/// written by the same build cannot take the launch. Nothing resolving is not a failure: the
/// mtime answer decides, which is what Run did before CMake reported targets at all.
pub fn cmake_artifact(output: &str, build_root: &Path, started_at: SystemTime) -> Option<String> {
    let reported = best_reported(output, build_root, started_at);
    choose_artifact(
        &executable_candidates(build_root),
        started_at,
        reported.as_deref(),
    )
}

/// The best of several reported targets: a file this build wrote first, then the newest, then path.
fn best_reported(output: &str, build_root: &Path, started_at: SystemTime) -> Option<String> {
    let mut resolved: Vec<(PathBuf, SystemTime)> = reported_targets(output)
        .iter()
        .filter_map(|name| resolve_target(build_root, name, started_at))
        .filter_map(|path| {
            let modified = fs::metadata(&path).ok()?.modified().ok()?;
            Some((path, modified))
        })
        .collect();
    prefer_written(&mut resolved, started_at);

    resolved.into_iter().next().map(|(path, _)| external(&path))
}

/// Where CMake writes a target, before any walk for a nested directory.
fn layout_paths(build_root: &Path, name: &str) -> Vec<PathBuf> {
    let exe = format!("{name}.exe");
    let mut paths = vec![build_root.join(name), build_root.join(&exe)];
    for config in MULTI_CONFIG_DIRS {
        paths.push(build_root.join(config).join(name));
        paths.push(build_root.join(config).join(&exe));
    }
    paths
}

/// Records `path` when it is a program this app would run.
fn collect_program(path: &Path, found: &mut Vec<(PathBuf, SystemTime)>) {
    if !is_candidate(path) || found.iter().any(|(seen, _)| seen == path) {
        return;
    }
    let Ok(modified) = fs::metadata(path).and_then(|meta| meta.modified()) else {
        return;
    };
    found.push((path.to_path_buf(), modified));
}

/// Bounded search for a file named exactly like the target, anywhere below `root`.
///
/// The name is compared whole, so a library (`libdemo.a`, `demo.so`, `demo.dll`) never matches the
/// executable target `demo`, and a directory called `demo` is descended rather than accepted.
fn walk_for_target(root: &Path, name: &str, depth: usize, found: &mut Vec<(PathBuf, SystemTime)>) {
    if depth > TARGET_SEARCH_DEPTH {
        return;
    }
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if meta.is_dir() {
            let directory = entry.file_name().to_string_lossy().into_owned();
            if SKIPPED.contains(&directory.as_str()) {
                continue;
            }
            walk_for_target(&path, name, depth + 1, found);
            continue;
        }
        let file_name = entry.file_name().to_string_lossy().into_owned();
        if file_name == name || file_name == format!("{name}.exe") {
            collect_program(&path, found);
        }
    }
}

/// Sorts written-by-this-build first, then newest first, then by path so the answer never wobbles.
fn prefer_written(found: &mut [(PathBuf, SystemTime)], written_since: SystemTime) {
    found.sort_by(|left, right| {
        let left_recent = left.1 >= written_since;
        let right_recent = right.1 >= written_since;
        right_recent
            .cmp(&left_recent)
            .then_with(|| right.1.cmp(&left.1))
            .then_with(|| left.0.cmp(&right.0))
    });
}
