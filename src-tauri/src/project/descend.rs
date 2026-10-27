//! Bounded downward search for a build marker.
//!
//! The ancestor walk in [`super::detect`] only looks at and above the opened directory, so a
//! repository whose crate lives one level down (`src-tauri/Cargo.toml`) has no marker anywhere on
//! that path and reads as [`ProjectKind::Unknown`] — no run targets, dead Run and Debug — while the
//! language-server root probe still finds the crate by searching downward. This module closes that
//! asymmetry: the same markers are looked for two levels below the root, and the directory holding
//! the match becomes the build root.

use super::*;

/// Directory names never searched into: build output, dependencies and our own state.
const SKIP_DIRS: &[&str] = &[
    "target",
    "node_modules",
    ".git",
    "build",
    "out",
    "dist",
    ".quarry",
    ".venv",
];

/// Levels below the opened root that may hold a manifest.
const MAX_DEPTH: usize = 2;

/// Marker priority inside one depth, mirroring the ancestor walk's order.
const RANK_CARGO: u8 = 1;
const RANK_CMAKE: u8 = 2;
const RANK_COMPILE_COMMANDS: u8 = 3;
const RANK_BUILD_COMPILE_COMMANDS: u8 = 4;

/// What one depth produced.
enum AtDepth {
    Missing,
    Found(Detected),
    /// Two markers share the shallowest depth and the top priority, so nothing is guessed.
    Ambiguous,
}

/// Shallowest marker below `root`, or `None` when there is none or the choice is ambiguous.
///
/// Depth dominates priority: a `CMakeLists.txt` one level down beats a `Cargo.toml` two levels
/// down. Only directories are read, never files, and symlinks are followed only while they still
/// resolve inside the root.
pub fn descend(root: &Path) -> Option<Detected> {
    let canonical = root.canonicalize().ok()?;
    let mut level = vec![canonical.clone()];
    for _ in 0..MAX_DEPTH {
        let dirs = child_directories(&level, &canonical);
        match marker_at_depth(&dirs) {
            AtDepth::Found(detected) => return Some(detected),
            AtDepth::Ambiguous => return None,
            AtDepth::Missing => {}
        }
        if dirs.is_empty() {
            return None;
        }
        level = dirs;
    }
    None
}

/// Directories one level below `level`, skipping [`SKIP_DIRS`] and anything a symlink points at
/// outside `root`.
fn child_directories(level: &[PathBuf], root: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    for parent in level {
        let Ok(entries) = fs::read_dir(parent) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            let path = entry.path();
            if file_type.is_symlink() {
                let Ok(resolved) = path.canonicalize() else {
                    continue;
                };
                if resolved.is_dir() && resolved.starts_with(root) {
                    dirs.push(resolved);
                }
                continue;
            }
            if !file_type.is_dir() {
                continue;
            }
            if SKIP_DIRS.contains(&entry.file_name().to_string_lossy().as_ref()) {
                continue;
            }
            dirs.push(path);
        }
    }
    dirs.sort();
    dirs.dedup();
    dirs
}

/// Best marker among the directories of one depth.
fn marker_at_depth(dirs: &[PathBuf]) -> AtDepth {
    let mut best: Option<(u8, Detected)> = None;
    for dir in dirs {
        let Some((rank, detected)) = marker_in(dir) else {
            continue;
        };
        match &best {
            Some((seen, _)) if *seen < rank => {}
            Some((seen, _)) if *seen == rank => return AtDepth::Ambiguous,
            _ => best = Some((rank, detected)),
        }
    }
    match best {
        Some((_, detected)) => AtDepth::Found(detected),
        None => AtDepth::Missing,
    }
}

/// The marker one directory holds, in the ancestor walk's priority order.
fn marker_in(dir: &Path) -> Option<(u8, Detected)> {
    let cargo_manifest = dir.join(CARGO_MANIFEST);
    if cargo_manifest.is_file() {
        return Some((
            RANK_CARGO,
            Detected {
                kind: ProjectKind::Cargo,
                build_root: dir.to_path_buf(),
                cargo_manifest: Some(cargo_manifest),
            },
        ));
    }
    if dir.join(CMAKE_MANIFEST).is_file() {
        return Some((
            RANK_CMAKE,
            Detected {
                kind: ProjectKind::Cmake,
                build_root: dir.to_path_buf(),
                cargo_manifest: None,
            },
        ));
    }
    if dir.join(COMPILE_COMMANDS).is_file() {
        return Some((
            RANK_COMPILE_COMMANDS,
            Detected {
                kind: ProjectKind::CompileCommands,
                build_root: dir.to_path_buf(),
                cargo_manifest: None,
            },
        ));
    }
    let build_root = dir.join(BUILD_DIR);
    if build_root.join(COMPILE_COMMANDS).is_file() {
        return Some((
            RANK_BUILD_COMPILE_COMMANDS,
            Detected {
                kind: ProjectKind::CompileCommands,
                build_root,
                cargo_manifest: None,
            },
        ));
    }
    None
}
