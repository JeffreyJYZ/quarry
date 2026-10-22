//! Wire shapes shared by the Tauri commands and the frontend.
//!
//! Frozen for P0: `src/project/api.ts` mirrors every type here. Add fields only by decision of the
//! controller, never from inside a unit.

use serde::Serialize;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ToolSource {
    /// Found on `PATH`.
    Path,
    /// Found through `xcrun --find`, which GUI-launched apps need for the Apple toolchain.
    Xcrun,
    /// Not found; the app runs but the feature that needs it is unavailable.
    Missing,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub name: String,
    pub path: Option<String>,
    pub source: ToolSource,
}

#[derive(Serialize, Clone, Debug)]
pub struct ToolchainReport {
    pub tools: Vec<ToolInfo>,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProjectKind {
    Cargo,
    Cmake,
    CompileCommands,
    Unknown,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    /// Absolute path of the opened directory.
    pub root: String,
    /// Directory name, or the Cargo package name when one is available.
    pub name: String,
    pub kind: ProjectKind,
    /// Where build commands run: the manifest directory for Cargo, otherwise the root.
    pub build_root: String,
    /// Absolute path of `.quarry/launch.json` when it exists.
    pub launch_config: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}
