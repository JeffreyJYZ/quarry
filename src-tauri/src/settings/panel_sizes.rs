#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use std::fs;
pub use std::path::PathBuf;
pub use tauri::{AppHandle, Manager};

use super::*;

pub fn deserialize_panel_disasm_width<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = f64::deserialize(deserializer).unwrap_or(520.0);
    Ok(value.clamp(240.0, 1200.0))
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
        Some(v) if crate::build_task::BUILD_PROFILES.contains(&v.as_str()) => Some(v),
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
        default = "default_disasm_width",
        deserialize_with = "deserialize_panel_disasm_width"
    )]
    pub disasm_width: f64,
    #[serde(
        default = "default_dock_height",
        deserialize_with = "deserialize_panel_dock_height"
    )]
    pub dock_height: f64,
    #[serde(
        default = "default_outline_height",
        deserialize_with = "deserialize_panel_outline_height"
    )]
    pub outline_height: f64,
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

pub fn default_disasm_width() -> f64 {
    520.0
}

pub fn default_dock_height() -> f64 {
    260.0
}

/// The outline sits under the tree; the panel keeps it so a long file list cannot swallow it.
pub fn default_outline_height() -> f64 {
    200.0
}

pub fn deserialize_panel_outline_height<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = f64::deserialize(deserializer).unwrap_or(200.0);
    Ok(value.clamp(80.0, 600.0))
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
            disasm_width: 520.0,
            dock_height: 260.0,
            outline_height: 200.0,
            terminal_height: 180.0,
            terminal_width: 380.0,
        }
    }
}

impl PanelSizes {
    pub(crate) fn normalize(&mut self) {
        self.rail_width = self.rail_width.clamp(160.0, 560.0);
        self.disasm_width = self.disasm_width.clamp(240.0, 1200.0);
        self.dock_height = self.dock_height.clamp(120.0, 900.0);
        self.terminal_height = self.terminal_height.clamp(100.0, 900.0);
        self.terminal_width = self.terminal_width.clamp(240.0, 900.0);
    }
}

#[cfg(test)]
mod tests_outline_height {
    use super::*;

    #[test]
    fn the_outline_height_survives_a_round_trip() {
        // The bug this pins: the TS PanelSizes has outlineHeight and this struct did not, so the
        // height the user dragged was dropped on the next read and the outline snapped back to 200.
        let json = serde_json::json!({ "outlineHeight": 320 });
        let sizes: PanelSizes = serde_json::from_value(json).expect("parses");
        assert_eq!(sizes.outline_height, 320.0);
    }

    #[test]
    fn the_outline_height_is_clamped_and_defaulted() {
        let tall: PanelSizes =
            serde_json::from_value(serde_json::json!({ "outlineHeight": 5000 })).expect("parses");
        assert_eq!(tall.outline_height, 600.0);

        let absent: PanelSizes = serde_json::from_value(serde_json::json!({})).expect("parses");
        assert_eq!(absent.outline_height, 200.0);
    }
}
