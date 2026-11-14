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
///
/// The reported `root` is the directory detection resolved, not the one the user picked: opening a
/// crate subdirectory otherwise leaves every later build, format and source command starting from a
/// directory that holds no manifest. The directory that was opened stays available as `opened_root`.
pub fn inspect(root: &str) -> Result<ProjectInfo, String> {
    let opened = Path::new(root)
        .canonicalize()
        .map_err(|error| format!("cannot open project root {root}: {error}"))?;
    if !opened.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    crate::workspace::register_opened_root(&opened);

    let (kind, project_root, build_root, cargo_manifest) = match detect(&opened) {
        Some(detected) => (
            detected.kind,
            detected.project_root,
            detected.build_root,
            detected.cargo_manifest,
        ),
        None => (ProjectKind::Unknown, opened.clone(), opened.clone(), None),
    };
    // The renderer may touch anything under the resolved root, which is where the tree is listed.
    crate::workspace::register_opened_root(&project_root);

    let name = cargo_manifest
        .as_deref()
        .and_then(cargo_package_name)
        .unwrap_or_else(|| directory_name(&project_root));

    Ok(ProjectInfo {
        root: display(&project_root),
        opened_root: display(&opened),
        name,
        kind,
        build_root: display(&build_root),
        launch_config: launch_config_path(&project_root),
    })
}

#[tauri::command]
pub fn open_project(root: String) -> Result<ProjectInfo, String> {
    match inspect(&root) {
        Ok(info) => {
            crate::logging::project_opened(&info.root, &format!("{:?}", info.kind));
            Ok(info)
        }
        Err(error) => {
            crate::logging::project_failed(&root, &error);
            Err(error)
        }
    }
}

pub struct Detected {
    pub(crate) kind: ProjectKind,
    /// Directory the project starts at: the ancestor holding the winning manifest, or the opened
    /// directory itself when the marker was found below it.
    pub(crate) project_root: PathBuf,
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

fn cargo_detected(dir: &Path, manifest: PathBuf) -> Detected {
    Detected {
        kind: ProjectKind::Cargo,
        project_root: dir.to_path_buf(),
        build_root: dir.to_path_buf(),
        cargo_manifest: Some(manifest),
    }
}

fn cmake_detected(dir: &Path) -> Detected {
    Detected {
        kind: ProjectKind::Cmake,
        project_root: dir.to_path_buf(),
        build_root: dir.to_path_buf(),
        cargo_manifest: None,
    }
}

fn compile_commands_detected(project_root: &Path, build_root: PathBuf) -> Detected {
    Detected {
        kind: ProjectKind::CompileCommands,
        project_root: project_root.to_path_buf(),
        build_root,
        cargo_manifest: None,
    }
}

/// The original upward walk: the root itself first, then each parent.
///
/// A manifest always beats a compiler database, however far above it sits: `compile_commands.json`
/// is build output, so the one inside a build directory must never shadow the `CMakeLists.txt` that
/// generated it. The database is kept as a fallback and returned only when the whole walk above the
/// root finds no manifest.
fn detect_ancestors(root: &Path) -> Option<Detected> {
    let mut compiled: Option<Detected> = None;
    for ancestor in root.ancestors() {
        let cargo_manifest = ancestor.join(CARGO_MANIFEST);
        if cargo_manifest.is_file() {
            return Some(cargo_detected(ancestor, cargo_manifest));
        }
        if ancestor.join(CMAKE_MANIFEST).is_file() {
            return Some(cmake_detected(ancestor));
        }
        if compiled.is_some() {
            continue;
        }
        if ancestor.join(COMPILE_COMMANDS).is_file() {
            compiled = Some(compile_commands_detected(ancestor, ancestor.to_path_buf()));
            continue;
        }
        let build_root = ancestor.join(BUILD_DIR);
        if build_root.join(COMPILE_COMMANDS).is_file() {
            compiled = Some(compile_commands_detected(ancestor, build_root));
        }
    }
    compiled
}
