#![allow(unused_imports)]

pub(crate) use crate::types::{ProjectInfo, ProjectKind};
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

pub const CARGO_MANIFEST: &str = "Cargo.toml";

pub const CMAKE_MANIFEST: &str = "CMakeLists.txt";

pub const COMPILE_COMMANDS: &str = "compile_commands.json";

pub const BUILD_DIR: &str = "build";

pub const LAUNCH_CONFIG: &str = ".quarry/launch.json";

/// Inspects a project root: canonicalises it, walks up for a build marker, and reports kind, name,
/// build root and launch config. Never spawns a build.
pub fn inspect(root: &str) -> Result<ProjectInfo, String> {
    let canonical = Path::new(root)
        .canonicalize()
        .map_err(|error| format!("cannot open project root {root}: {error}"))?;
    if !canonical.is_dir() {
        return Err(format!("not a directory: {root}"));
    }

    let (kind, build_root, cargo_manifest) = match detect(&canonical) {
        Some(detected) => (detected.kind, detected.build_root, detected.cargo_manifest),
        None => (ProjectKind::Unknown, canonical.clone(), None),
    };

    let name = cargo_manifest
        .as_deref()
        .and_then(cargo_package_name)
        .unwrap_or_else(|| directory_name(&canonical));

    Ok(ProjectInfo {
        root: display(&canonical),
        name,
        kind,
        build_root: display(&build_root),
        launch_config: launch_config_path(&canonical),
    })
}

#[tauri::command]
pub fn open_project(root: String) -> Result<ProjectInfo, String> {
    inspect(&root)
}

pub struct Detected {
    pub(crate) kind: ProjectKind,
    /// Directory a build command runs in: the manifest directory, or a `build` directory when the
    /// only marker is a nested `compile_commands.json`.
    pub(crate) build_root: PathBuf,
    /// `Cargo.toml` to read the package name from, when a Cargo manifest won.
    pub(crate) cargo_manifest: Option<PathBuf>,
}

/// Nearest ancestor wins; within one directory the markers are tried in priority order
/// (`Cargo.toml`, `CMakeLists.txt`, `compile_commands.json`, then `build/compile_commands.json`).
///
/// Only when nothing is found at or above the root does it search two levels below it, so a
/// repository whose crate lives in a subdirectory still resolves.
pub fn detect(root: &Path) -> Option<Detected> {
    detect_ancestors(root).or_else(|| descend(root))
}

/// The original upward walk: the root itself first, then each parent.
fn detect_ancestors(root: &Path) -> Option<Detected> {
    for ancestor in root.ancestors() {
        let cargo_manifest = ancestor.join(CARGO_MANIFEST);
        if cargo_manifest.is_file() {
            return Some(Detected {
                kind: ProjectKind::Cargo,
                build_root: ancestor.to_path_buf(),
                cargo_manifest: Some(cargo_manifest),
            });
        }
        if ancestor.join(CMAKE_MANIFEST).is_file() {
            return Some(Detected {
                kind: ProjectKind::Cmake,
                build_root: ancestor.to_path_buf(),
                cargo_manifest: None,
            });
        }
        if ancestor.join(COMPILE_COMMANDS).is_file() {
            return Some(Detected {
                kind: ProjectKind::CompileCommands,
                build_root: ancestor.to_path_buf(),
                cargo_manifest: None,
            });
        }
        let build_root = ancestor.join(BUILD_DIR);
        if build_root.join(COMPILE_COMMANDS).is_file() {
            return Some(Detected {
                kind: ProjectKind::CompileCommands,
                build_root,
                cargo_manifest: None,
            });
        }
    }
    None
}
