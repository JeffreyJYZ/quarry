#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use std::fs;
pub use std::path::PathBuf;
pub use tauri::{AppHandle, Manager};

use super::*;

pub fn deserialize_panel_debug_width<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = f64::deserialize(deserializer).unwrap_or(320.0);
    Ok(value.clamp(200.0, 640.0))
}

pub fn deserialize_panel_dock_height<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = f64::deserialize(deserializer).unwrap_or(260.0);
    Ok(value.clamp(120.0, 900.0))
}

pub fn deserialize_panel_terminal_height<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = f64::deserialize(deserializer).unwrap_or(180.0);
    Ok(value.clamp(100.0, 900.0))
}

pub fn deserialize_panel_terminal_width<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value: f64 = f64::deserialize(deserializer).unwrap_or(380.0);
    Ok(value.clamp(240.0, 900.0))
}

pub fn deserialize_project_editor_tab_size<'de, D>(deserializer: D) -> Result<Option<u32>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<u32>::deserialize(deserializer).unwrap_or(None);
    Ok(match value {
        Some(v) if matches!(v, 2 | 4 | 8) => Some(v),
        _ => None,
    })
}

pub fn deserialize_project_format_on_save<'de, D>(deserializer: D) -> Result<Option<bool>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<bool>::deserialize(deserializer).unwrap_or(None))
}

pub fn deserialize_project_build_profile<'de, D>(
    deserializer: D,
) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<String>::deserialize(deserializer).unwrap_or(None);
    Ok(match value {
        Some(v) if v == "debug" || v == "release" => Some(v),
        _ => None,
    })
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct PanelSizes {
    #[serde(
        default = "default_rail_width",
        deserialize_with = "deserialize_panel_rail_width"
    )]
    pub rail_width: f64,
    #[serde(
        default = "default_debug_width",
        deserialize_with = "deserialize_panel_debug_width"
    )]
    pub debug_width: f64,
    #[serde(
        default = "default_dock_height",
        deserialize_with = "deserialize_panel_dock_height"
    )]
    pub dock_height: f64,
    #[serde(
        default = "default_terminal_height",
        deserialize_with = "deserialize_panel_terminal_height"
    )]
    pub terminal_height: f64,
    #[serde(
        default = "default_terminal_width",
        deserialize_with = "deserialize_panel_terminal_width"
    )]
    pub terminal_width: f64,
}

pub fn default_rail_width() -> f64 {
    240.0
}

pub fn default_debug_width() -> f64 {
    320.0
}

pub fn default_dock_height() -> f64 {
    260.0
}

pub fn default_terminal_height() -> f64 {
    180.0
}

pub fn default_terminal_width() -> f64 {
    380.0
}

impl Default for PanelSizes {
    fn default() -> Self {
        Self {
            rail_width: 240.0,
            debug_width: 320.0,
            dock_height: 260.0,
            terminal_height: 180.0,
            terminal_width: 380.0,
        }
    }
}

impl PanelSizes {
    pub(crate) fn normalize(&mut self) {
        self.rail_width = self.rail_width.clamp(160.0, 560.0);
        self.debug_width = self.debug_width.clamp(200.0, 640.0);
        self.dock_height = self.dock_height.clamp(120.0, 900.0);
        self.terminal_height = self.terminal_height.clamp(100.0, 900.0);
        self.terminal_width = self.terminal_width.clamp(240.0, 900.0);
    }
}
