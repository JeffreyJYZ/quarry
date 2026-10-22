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

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Absolute path of the project that was open last.
    pub last_root: Option<String>,
    /// Absolute paths of the files that had a tab, in strip order.
    #[serde(default)]
    pub open_files: Vec<String>,
    /// Absolute path of the tab that was active.
    pub active_file: Option<String>,
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
    }

    #[test]
    fn roundtrip_keeps_every_field() {
        let settings = Settings {
            last_root: Some("/tmp/project".to_string()),
            open_files: vec!["/tmp/project/src/main.rs".to_string()],
            active_file: Some("/tmp/project/src/main.rs".to_string()),
        };
        let text = serde_json::to_string_pretty(&settings).expect("serializes");
        let back: Settings = serde_json::from_str(&text).expect("parses");
        assert_eq!(back.last_root, settings.last_root);
        assert_eq!(back.open_files, settings.open_files);
        assert_eq!(back.active_file, settings.active_file);
    }
}
