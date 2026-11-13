#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use std::fs;
pub use std::path::PathBuf;
pub use tauri::{AppHandle, Manager};

use super::*;

/// A project's overrides; `None` means the user-wide preference applies.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ProjectSettings {
    #[serde(default, deserialize_with = "deserialize_project_editor_tab_size")]
    pub editor_tab_size: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_project_format_on_save")]
    pub format_on_save: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_project_build_profile")]
    pub build_profile: Option<String>,
    /// CMake configure preset from `CMakePresets.json`; empty uses the only visible one.
    #[serde(default)]
    pub cmake_preset: String,
    /// CMake build directory; empty detects the configured tree, then falls back to `<root>/build`.
    #[serde(default)]
    pub cmake_build_dir: String,
    /// CMake toolchain file; empty keeps the preset's own `CMAKE_TOOLCHAIN_FILE`.
    #[serde(default)]
    pub cmake_toolchain_file: String,
    /// Fields written by another build, kept verbatim so a save from this build never drops them.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}
