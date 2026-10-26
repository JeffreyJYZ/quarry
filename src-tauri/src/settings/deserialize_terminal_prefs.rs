#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use std::fs;
pub use std::path::PathBuf;
pub use tauri::{AppHandle, Manager};

use super::*;

pub fn deserialize_preferences_terminal_line_height<'de, D>(
    deserializer: D,
) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = f64::deserialize(deserializer).unwrap_or(1.2);
    let rounded = (value * 10.0).round() / 10.0;
    Ok(rounded.clamp(1.0, 2.0))
}

pub fn deserialize_preferences_terminal_cursor_style<'de, D>(
    deserializer: D,
) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = String::deserialize(deserializer).unwrap_or_else(|_| "block".to_string());
    Ok(match value.as_str() {
        "block" | "bar" | "underline" => value,
        _ => "block".to_string(),
    })
}

pub fn deserialize_preferences_terminal_cursor_blink<'de, D>(
    deserializer: D,
) -> Result<bool, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(bool::deserialize(deserializer).unwrap_or(true))
}

pub fn deserialize_preferences_terminal_scrollback<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = u32::deserialize(deserializer).unwrap_or(5000);
    Ok(value.clamp(500, 50000))
}

pub fn deserialize_preferences_terminal_letter_spacing<'de, D>(
    deserializer: D,
) -> Result<i32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = i32::deserialize(deserializer).unwrap_or(0);
    Ok(value.clamp(-2, 4))
}

pub fn deserialize_preferences_editor_tab_size<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = u32::deserialize(deserializer).unwrap_or(4);
    Ok(match value {
        2 | 4 | 8 => value,
        _ => 4,
    })
}

pub fn deserialize_preferences_build_profile<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = String::deserialize(deserializer).unwrap_or_else(|_| "debug".to_string());
    Ok(match value.as_str() {
        "debug" | "release" => value,
        _ => "debug".to_string(),
    })
}
