#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use std::fs;
pub use std::path::PathBuf;
pub use tauri::{AppHandle, Manager};

use super::*;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    #[serde(
        default = "default_editor_font_size",
        deserialize_with = "deserialize_preferences_editor_font_size"
    )]
    pub editor_font_size: f64,
    #[serde(
        default = "default_editor_tab_size",
        deserialize_with = "deserialize_preferences_editor_tab_size"
    )]
    pub editor_tab_size: u32,
    #[serde(
        default = "default_terminal_font_size",
        deserialize_with = "deserialize_preferences_terminal_font_size"
    )]
    pub terminal_font_size: f64,
    #[serde(default)]
    pub format_on_save: bool,
    #[serde(
        default = "default_build_profile",
        deserialize_with = "deserialize_preferences_build_profile"
    )]
    pub build_profile: String,
    #[serde(default, deserialize_with = "deserialize_terminal_placement")]
    pub terminal_placement: String,
    /// Editor font family; empty means the built-in monospace stack.
    #[serde(default)]
    pub editor_font_family: String,
    /// Terminal font family; empty means the built-in monospace stack.
    #[serde(default)]
    pub terminal_font_family: String,
    /// Absolute path to rust-analyzer; empty means discover it.
    #[serde(default)]
    pub rust_analyzer_path: String,
    /// Extra arguments for rust-analyzer, split on whitespace by the frontend.
    #[serde(default)]
    pub rust_analyzer_args: String,
    /// Absolute path to clangd; empty means discover it.
    #[serde(default)]
    pub clangd_path: String,
    /// Extra arguments for clangd.
    #[serde(default)]
    pub clangd_args: String,
    #[serde(default, deserialize_with = "deserialize_panel_sizes")]
    pub panel_sizes: PanelSizes,
}

pub fn default_editor_font_size() -> f64 {
    13.0
}

pub fn default_editor_tab_size() -> u32 {
    4
}

pub fn default_terminal_font_size() -> f64 {
    13.0
}

pub fn default_build_profile() -> String {
    "debug".to_string()
}

pub fn default_terminal_placement() -> String {
    "bottom".to_string()
}

pub fn deserialize_terminal_placement<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value: String =
        String::deserialize(deserializer).unwrap_or_else(|_| default_terminal_placement());
    Ok(match value.as_str() {
        "right" => "right".to_string(),
        _ => default_terminal_placement(),
    })
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            editor_font_size: 13.0,
            editor_tab_size: 4,
            terminal_font_size: 13.0,
            format_on_save: false,
            build_profile: "debug".to_string(),
            terminal_placement: "bottom".to_string(),
            editor_font_family: String::new(),
            terminal_font_family: String::new(),
            rust_analyzer_path: String::new(),
            rust_analyzer_args: String::new(),
            clangd_path: String::new(),
            clangd_args: String::new(),
            panel_sizes: PanelSizes::default(),
        }
    }
}

impl Preferences {
    pub(crate) fn normalize(&mut self) {
        self.editor_font_size = self.editor_font_size.clamp(9.0, 24.0);
        self.terminal_font_size = self.terminal_font_size.clamp(9.0, 24.0);
        if !matches!(self.editor_tab_size, 2 | 4 | 8) {
            self.editor_tab_size = 4;
        }
        if self.build_profile != "debug" && self.build_profile != "release" {
            self.build_profile = "debug".to_string();
        }
        self.panel_sizes.normalize();
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ProjectSettings {
    #[serde(default, deserialize_with = "deserialize_project_editor_tab_size")]
    pub editor_tab_size: Option<u32>,
    #[serde(default, deserialize_with = "deserialize_project_format_on_save")]
    pub format_on_save: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_project_build_profile")]
    pub build_profile: Option<String>,
}
