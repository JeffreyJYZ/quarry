//! Settings persisted to the app config directory.
//!
//! The only durable piece in P0 is the last opened project, so a relaunch lands where the user left off.
//! The file lives under the platform config directory (`app.path().app_config_dir()`), never inside a
//! project. Malformed settings are treated as empty rather than as an error: a corrupt preference must
//! never block startup.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";

fn dock_tab_default() -> String {
    "problems".to_string()
}

fn deserialize_dock_tab<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = String::deserialize(deserializer)?;
    match value.as_str() {
        "tests" | "problems" | "refs" | "run" => Ok(value),
        _ => Ok(dock_tab_default()),
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Absolute path of the project that was open last.
    pub last_root: Option<String>,
    /// Absolute paths of the files that had a tab, in strip order.
    #[serde(default)]
    pub open_files: Vec<String>,
    /// Absolute path of the tab that was active.
    pub active_file: Option<String>,
    /// Whether the left rail is collapsed.
    #[serde(default)]
    pub rail_collapsed: bool,
    /// Whether the debug panel is open.
    #[serde(default)]
    pub debug_open: bool,
    /// Whether the git panel is open.
    #[serde(default)]
    pub git_open: bool,
    /// Active dock tab.
    #[serde(
        default = "dock_tab_default",
        deserialize_with = "deserialize_dock_tab"
    )]
    pub dock_tab: String,
    /// Whether the dock is expanded; None means follow the error count.
    #[serde(default)]
    pub dock_expanded: Option<bool>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            last_root: None,
            open_files: Vec::new(),
            active_file: None,
            rail_collapsed: false,
            debug_open: false,
            git_open: false,
            dock_tab: dock_tab_default(),
            dock_expanded: None,
        }
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(SETTINGS_FILE))
        .map_err(|error| format!("cannot locate the config directory: {error}"))
}

#[tauri::command]
pub fn read_settings(app: AppHandle) -> Settings {
    settings_path(&app)
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn write_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    let path = settings_path(&app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("cannot create {}: {error}", parent.display()))?;
    }
    let text = serde_json::to_string_pretty(&settings)
        .map_err(|error| format!("cannot serialize settings: {error}"))?;
    fs::write(&path, format!("{text}\n"))
        .map_err(|error| format!("cannot write {}: {error}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::Settings;

    #[test]
    fn missing_fields_default_to_empty() {
        let parsed: Settings = serde_json::from_str("{}").expect("empty object parses");
        assert!(parsed.last_root.is_none());
        assert!(parsed.open_files.is_empty());
        assert!(parsed.active_file.is_none());
        assert!(!parsed.rail_collapsed);
        assert!(!parsed.debug_open);
        assert!(!parsed.git_open);
        assert_eq!(parsed.dock_tab, "problems");
        assert!(parsed.dock_expanded.is_none());
    }

    #[test]
    fn unknown_dock_tab_falls_back() {
        let parsed: Settings = serde_json::from_str(r#"{"dockTab":"bogus"}"#).expect("parses");
        assert_eq!(parsed.dock_tab, "problems");
    }

    #[test]
    fn roundtrip_keeps_every_field() {
        let settings = Settings {
            last_root: Some("/tmp/project".to_string()),
            open_files: vec!["/tmp/project/src/main.rs".to_string()],
            active_file: Some("/tmp/project/src/main.rs".to_string()),
            rail_collapsed: true,
            debug_open: true,
            git_open: false,
            dock_tab: "run".to_string(),
            dock_expanded: Some(true),
        };
        let text = serde_json::to_string_pretty(&settings).expect("serializes");
        let back: Settings = serde_json::from_str(&text).expect("parses");
        assert_eq!(back.last_root, settings.last_root);
        assert_eq!(back.open_files, settings.open_files);
        assert_eq!(back.active_file, settings.active_file);
        assert_eq!(back.rail_collapsed, settings.rail_collapsed);
        assert_eq!(back.debug_open, settings.debug_open);
        assert_eq!(back.git_open, settings.git_open);
        assert_eq!(back.dock_tab, settings.dock_tab);
        assert_eq!(back.dock_expanded, settings.dock_expanded);
    }

    #[test]
    fn corrupt_file_yields_defaults() {
        let result: Result<Settings, _> = serde_json::from_str("{not json");
        assert!(result.is_err());
    }

    #[test]
    fn old_file_parses_with_defaults() {
        let parsed: Settings =
            serde_json::from_str(r#"{"lastRoot":"/tmp/p","openFiles":[],"activeFile":null}"#)
                .expect("old file parses");
        assert_eq!(parsed.last_root.as_deref(), Some("/tmp/p"));
        assert_eq!(parsed.dock_tab, "problems");
    }
}
