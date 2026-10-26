#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use std::fs;
pub use std::path::PathBuf;
pub use tauri::{AppHandle, Manager};

use super::*;

pub const SETTINGS_FILE: &str = "settings.json";

pub fn dock_tab_default() -> String {
    "problems".to_string()
}

pub fn deserialize_recent_roots<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let values: Vec<String> = Vec::deserialize(deserializer).unwrap_or_default();
    let mut out: Vec<String> = Vec::new();
    for value in values {
        let path = std::path::Path::new(&value);
        if !path.is_absolute() {
            continue;
        }
        if !path.exists() {
            continue;
        }
        if !out.contains(&value) {
            out.push(value);
        }
    }
    if out.len() > 10 {
        out.truncate(10);
    }
    Ok(out)
}

pub fn deserialize_dock_tab<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = String::deserialize(deserializer)?;
    match value.as_str() {
        "tests" | "problems" | "refs" | "run" => Ok(value),
        _ => Ok(dock_tab_default()),
    }
}

/// Drop configurations a selector could not tell apart: an unnamed entry and every repeat of a name
/// keep the first one, so a hand-edited file still loads instead of failing the whole settings read.
pub fn deserialize_run_configurations<'de, D>(
    deserializer: D,
) -> Result<Vec<RunConfiguration>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let values: Vec<RunConfiguration> = Vec::deserialize(deserializer).unwrap_or_default();
    let mut out: Vec<RunConfiguration> = Vec::new();
    for mut config in values {
        config.name = config.name.trim().to_string();
        if config.name.is_empty() {
            continue;
        }
        if out.iter().any(|other| other.name == config.name) {
            continue;
        }
        out.push(config);
    }
    Ok(out)
}

/// One saved run panel, stored as a snapshot of the form rather than as an override.
///
/// `args` stays the raw args field so the frontend splits it with the same quote-aware `splitArgs`
/// it uses for an unsaved run; `env` keeps the form's row order as `[name, value]` pairs.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RunConfiguration {
    /// Unique name the selector shows; empty names are dropped on read.
    #[serde(default)]
    pub name: String,
    /// Program path exactly as the form showed it.
    #[serde(default)]
    pub program: String,
    /// The args field verbatim, still split by the frontend at run time.
    #[serde(default)]
    pub args: String,
    /// Working directory exactly as the form showed it.
    #[serde(default)]
    pub cwd: String,
    /// Environment rows in form order, as `[name, value]` pairs.
    #[serde(default)]
    pub env: Vec<(String, String)>,
}

pub fn deserialize_panel_sizes<'de, D>(deserializer: D) -> Result<PanelSizes, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let raw = serde_json::Value::deserialize(deserializer).unwrap_or_default();
    let mut out: PanelSizes = serde_json::from_value(raw).unwrap_or_default();
    out.normalize();
    Ok(out)
}

pub fn deserialize_preferences_editor_font_size<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = f64::deserialize(deserializer).unwrap_or(13.0);
    Ok(value.clamp(9.0, 24.0))
}

pub fn deserialize_preferences_terminal_font_size<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = f64::deserialize(deserializer).unwrap_or(13.0);
    Ok(value.clamp(9.0, 24.0))
}

pub fn deserialize_panel_rail_width<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = f64::deserialize(deserializer).unwrap_or(240.0);
    Ok(value.clamp(160.0, 560.0))
}
