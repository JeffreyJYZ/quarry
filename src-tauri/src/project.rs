//! Project model.
//!
//! Unit U2 owns the body of this file. Contract: given a directory, walk up for `Cargo.toml`,
//! `CMakeLists.txt` or `compile_commands.json`, decide the kind, derive the build root and the name,
//! and report whether `.quarry/launch.json` exists. Never spawn a build here.

use crate::types::{ProjectInfo, ProjectKind};
use std::path::Path;

#[tauri::command]
pub fn open_project(root: String) -> Result<ProjectInfo, String> {
    // STUB: U2 replaces this with real detection.
    let path = Path::new(&root);
    if !path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    let name = path
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .ok_or_else(|| format!("cannot derive a project name from {root}"))?;

    Ok(ProjectInfo {
        root: root.clone(),
        name,
        kind: ProjectKind::Unknown,
        build_root: root,
        launch_config: None,
    })
}
