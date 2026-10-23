#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use std::fs;
pub use std::path::PathBuf;
pub use tauri::{AppHandle, Manager};

use super::*;

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
    /// Recently opened project roots, most-recent-first, deduplicated, capped at 10.
    #[serde(default, deserialize_with = "deserialize_recent_roots")]
    pub recent_roots: Vec<String>,
    /// Saved run configurations for the run panel, in save order.
    #[serde(default, deserialize_with = "deserialize_run_configurations")]
    pub run_configurations: Vec<RunConfiguration>,
    /// Files opened most recently, newest first, capped at 20.
    #[serde(default)]
    pub recent_files: Vec<String>,
    /// Directory the New project dialog was last pointed at, so it opens there next time.
    #[serde(default)]
    pub new_project_parent: Option<String>,
    /// User-wide preferences: editor, terminal, build profile and panel sizes.
    #[serde(default)]
    pub preferences: Preferences,
    /// Fields written by another build, kept verbatim so a save from this build never drops them.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
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
            recent_roots: Vec::new(),
            run_configurations: Vec::new(),
            recent_files: Vec::new(),
            new_project_parent: None,
            preferences: Preferences::default(),
            extra: serde_json::Map::new(),
        }
    }
}

pub fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
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

#[tauri::command]
pub fn read_project_settings(root: String) -> ProjectSettings {
    let path = std::path::Path::new(&root);
    if !path.is_dir() {
        return ProjectSettings::default();
    }
    let file = path.join(".quarry").join("settings.json");
    match fs::read_to_string(&file) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => ProjectSettings::default(),
    }
}

#[tauri::command]
pub fn write_project_settings(root: String, settings: ProjectSettings) -> Result<(), String> {
    let trimmed = root.trim();
    if trimmed.is_empty() {
        return Err("the project root is empty.".to_string());
    }
    let path = std::path::Path::new(trimmed);
    if !path.is_absolute() {
        return Err(format!("root must be an absolute path: {root}"));
    }
    if !path.is_dir() {
        return Err(format!("directory does not exist: {root}"));
    }
    let dir = path.join(".quarry");
    fs::create_dir_all(&dir)
        .map_err(|error| format!("cannot create {}: {error}", dir.display()))?;
    let file = dir.join("settings.json");
    let text = serde_json::to_string_pretty(&settings)
        .map_err(|error| format!("cannot serialize project settings: {error}"))?;
    fs::write(&file, format!("{text}\n"))
        .map_err(|error| format!("cannot write {}: {error}", file.display()))
}
