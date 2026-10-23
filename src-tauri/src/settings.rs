//! Settings persisted to the app config directory.
//!
//! The only durable piece in P0 is the last opened project, so a relaunch lands where the user left off.
//! The file lives under the platform config directory (`app.path().app_config_dir()`), never inside a
//! project. Malformed settings are treated as empty rather than as an error: a corrupt preference must
//! never block startup.

#![allow(dead_code)]
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";

fn dock_tab_default() -> String {
    "problems".to_string()
}

fn deserialize_recent_roots<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
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

/// Drop configurations a selector could not tell apart: an unnamed entry and every repeat of a name
/// keep the first one, so a hand-edited file still loads instead of failing the whole settings read.
fn deserialize_run_configurations<'de, D>(
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

fn deserialize_panel_sizes<'de, D>(deserializer: D) -> Result<PanelSizes, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let raw = serde_json::Value::deserialize(deserializer).unwrap_or_default();
    let mut out: PanelSizes = serde_json::from_value(raw).unwrap_or_default();
    out.normalize();
    Ok(out)
}

fn deserialize_preferences_editor_font_size<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = f64::deserialize(deserializer).unwrap_or(13.0);
    Ok(value.clamp(9.0, 24.0))
}

fn deserialize_preferences_terminal_font_size<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = f64::deserialize(deserializer).unwrap_or(13.0);
    Ok(value.clamp(9.0, 24.0))
}

fn deserialize_preferences_editor_tab_size<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = u32::deserialize(deserializer).unwrap_or(4);
    Ok(match value {
        2 | 4 | 8 => value,
        _ => 4,
    })
}

fn deserialize_preferences_build_profile<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = String::deserialize(deserializer).unwrap_or_else(|_| "debug".to_string());
    Ok(match value.as_str() {
        "debug" | "release" => value,
        _ => "debug".to_string(),
    })
}

fn deserialize_panel_rail_width<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = f64::deserialize(deserializer).unwrap_or(240.0);
    Ok(value.clamp(160.0, 560.0))
}

fn deserialize_panel_debug_width<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = f64::deserialize(deserializer).unwrap_or(320.0);
    Ok(value.clamp(200.0, 640.0))
}

fn deserialize_panel_dock_height<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = f64::deserialize(deserializer).unwrap_or(260.0);
    Ok(value.clamp(120.0, 900.0))
}

fn deserialize_panel_terminal_height<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = f64::deserialize(deserializer).unwrap_or(180.0);
    Ok(value.clamp(100.0, 900.0))
}

fn deserialize_project_editor_tab_size<'de, D>(deserializer: D) -> Result<Option<u32>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<u32>::deserialize(deserializer).unwrap_or(None);
    Ok(match value {
        Some(v) if matches!(v, 2 | 4 | 8) => Some(v),
        _ => None,
    })
}

fn deserialize_project_format_on_save<'de, D>(deserializer: D) -> Result<Option<bool>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<bool>::deserialize(deserializer).unwrap_or(None))
}

fn deserialize_project_build_profile<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
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
}

fn default_rail_width() -> f64 {
    240.0
}
fn default_debug_width() -> f64 {
    320.0
}
fn default_dock_height() -> f64 {
    260.0
}
fn default_terminal_height() -> f64 {
    180.0
}

impl Default for PanelSizes {
    fn default() -> Self {
        Self {
            rail_width: 240.0,
            debug_width: 320.0,
            dock_height: 260.0,
            terminal_height: 180.0,
        }
    }
}

impl PanelSizes {
    fn normalize(&mut self) {
        self.rail_width = self.rail_width.clamp(160.0, 560.0);
        self.debug_width = self.debug_width.clamp(200.0, 640.0);
        self.dock_height = self.dock_height.clamp(120.0, 900.0);
        self.terminal_height = self.terminal_height.clamp(100.0, 900.0);
    }
}

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
    #[serde(default, deserialize_with = "deserialize_panel_sizes")]
    pub panel_sizes: PanelSizes,
}

fn default_editor_font_size() -> f64 {
    13.0
}
fn default_editor_tab_size() -> u32 {
    4
}
fn default_terminal_font_size() -> f64 {
    13.0
}
fn default_build_profile() -> String {
    "debug".to_string()
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            editor_font_size: 13.0,
            editor_tab_size: 4,
            terminal_font_size: 13.0,
            format_on_save: false,
            build_profile: "debug".to_string(),
            panel_sizes: PanelSizes::default(),
        }
    }
}

impl Preferences {
    fn normalize(&mut self) {
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
            preferences: Preferences::default(),
            extra: serde_json::Map::new(),
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

pub fn remember_root_value(settings: &mut Settings, root: String) -> Result<Vec<String>, String> {
    let path = std::path::Path::new(&root);
    if !path.is_absolute() {
        return Err(format!("root must be an absolute path: {root}"));
    }
    if !path.exists() {
        return Err(format!("directory does not exist: {root}"));
    }
    let mut list = settings.recent_roots.clone();
    list.retain(|entry| entry != &root);
    list.insert(0, root);
    if list.len() > 10 {
        list.truncate(10);
    }
    settings.recent_roots = list.clone();
    Ok(list)
}

#[tauri::command]
pub fn remember_root(app: AppHandle, root: String) -> Result<Vec<String>, String> {
    let mut settings = read_settings(app.clone());
    let list = remember_root_value(&mut settings, root)?;
    write_settings(app, settings)?;
    Ok(list)
}

#[cfg(test)]
mod tests {
    use super::{RunConfiguration, Settings};

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
        assert!(parsed.run_configurations.is_empty());
        assert!(parsed.extra.is_empty());
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
            recent_roots: vec!["/tmp".to_string()],
            ..Default::default()
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
        assert_eq!(back.recent_roots, settings.recent_roots);
    }

    #[test]
    fn run_configuration_round_trips() {
        let configuration = RunConfiguration {
            name: "debug server".to_string(),
            program: "/tmp/project/target/debug/app".to_string(),
            args: "--port 8080 --name \"two words\"".to_string(),
            cwd: "/tmp/project".to_string(),
            env: vec![
                ("RUST_LOG".to_string(), "debug".to_string()),
                ("EMPTY".to_string(), String::new()),
            ],
        };
        let settings = Settings {
            run_configurations: vec![configuration.clone()],
            ..Default::default()
        };

        let text = serde_json::to_string_pretty(&settings).expect("serializes");
        let back: Settings = serde_json::from_str(&text).expect("parses");

        assert_eq!(back.run_configurations, vec![configuration]);
        let compact = serde_json::to_string(&settings).expect("serializes");
        assert!(
            compact.contains(r#""env":[["RUST_LOG","debug"],["EMPTY",""]]"#),
            "env is not written as name/value pairs: {compact}"
        );
    }

    #[test]
    fn a_legacy_file_without_run_configurations_still_loads() {
        let parsed: Settings = serde_json::from_str(
            r#"{"lastRoot":"/tmp/p","openFiles":["/tmp/p/src/main.rs"],"activeFile":null,"railCollapsed":true,"dockTab":"run"}"#,
        )
        .expect("a settings file written before run configurations parses");

        assert_eq!(parsed.last_root.as_deref(), Some("/tmp/p"));
        assert_eq!(parsed.dock_tab, "run");
        assert!(parsed.run_configurations.is_empty());
    }

    #[test]
    fn empty_run_configuration_names_are_dropped_on_read() {
        let parsed: Settings = serde_json::from_str(
            r#"{"runConfigurations":[{"name":"  ","program":"a"},{"name":" run ","program":"b"}]}"#,
        )
        .expect("parses");

        assert_eq!(parsed.run_configurations.len(), 1);
        assert_eq!(parsed.run_configurations[0].name, "run");
        assert_eq!(parsed.run_configurations[0].program, "b");
    }

    #[test]
    fn duplicate_run_configuration_names_keep_the_first_on_read() {
        let parsed: Settings = serde_json::from_str(
            r#"{"runConfigurations":[{"name":"run","program":"a"},{"name":" run","program":"b"}]}"#,
        )
        .expect("parses");

        assert_eq!(parsed.run_configurations.len(), 1);
        assert_eq!(parsed.run_configurations[0].program, "a");
    }

    #[test]
    fn a_configuration_without_optional_fields_parses() {
        let parsed: Settings =
            serde_json::from_str(r#"{"runConfigurations":[{"name":"bare"}]}"#).expect("parses");

        let config = &parsed.run_configurations[0];
        assert_eq!(config.name, "bare");
        assert!(config.program.is_empty());
        assert!(config.args.is_empty());
        assert!(config.cwd.is_empty());
        assert!(config.env.is_empty());
    }

    #[test]
    fn fields_from_a_newer_build_survive_a_rewrite() {
        let parsed: Settings =
            serde_json::from_str(r#"{"lastRoot":null,"futureFlag":true,"futureList":[1,2]}"#)
                .expect("parses");

        let text = serde_json::to_string_pretty(&parsed).expect("serializes");
        let back: Settings = serde_json::from_str(&text).expect("parses");

        assert_eq!(
            back.extra.get("futureFlag"),
            Some(&serde_json::Value::Bool(true))
        );
        assert_eq!(
            back.extra
                .get("futureList")
                .and_then(|v| v.as_array())
                .map(Vec::len),
            Some(2)
        );
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
        assert!(parsed.recent_roots.is_empty());
    }

    #[test]
    fn remember_root_moves_to_front_and_dedupes() {
        let mut settings = Settings {
            recent_roots: vec!["/private/tmp".to_string(), "/tmp".to_string()],
            ..Default::default()
        };
        let list = super::remember_root_value(&mut settings, "/tmp".to_string()).expect("ok");
        assert_eq!(list, vec!["/tmp".to_string(), "/private/tmp".to_string()]);
        assert_eq!(settings.recent_roots, list);
    }

    #[test]
    fn remember_root_caps_at_ten() {
        let mut s2 = Settings::default();
        for _ in 0..12 {
            let _ = super::remember_root_value(&mut s2, "/tmp".to_string());
        }
        assert!(s2.recent_roots.len() <= 10);
    }

    #[test]
    fn remember_root_rejects_relative() {
        let mut settings = Settings::default();
        let err =
            super::remember_root_value(&mut settings, "relative/project".to_string()).unwrap_err();
        assert!(err.contains("absolute"));
    }

    #[test]
    fn missing_directory_dropped_on_read() {
        let parsed: Settings =
            serde_json::from_str(r#"{"recentRoots":["/tmp","/definitely/missing/quarry-dir"]}"#)
                .expect("parses");
        assert_eq!(parsed.recent_roots, vec!["/tmp".to_string()]);
    }

    #[test]
    fn unrelated_fields_survive_remember() {
        let mut settings = Settings {
            last_root: Some("/tmp/project".to_string()),
            open_files: vec!["/tmp/project/src/main.rs".to_string()],
            active_file: Some("/tmp/project/src/main.rs".to_string()),
            rail_collapsed: true,
            debug_open: true,
            git_open: false,
            dock_tab: "run".to_string(),
            dock_expanded: Some(true),
            recent_roots: vec![],
            ..Default::default()
        };
        let before_last = settings.last_root.clone();
        let before_open = settings.open_files.clone();
        let before_active = settings.active_file.clone();
        let before_rail = settings.rail_collapsed;
        let before_debug = settings.debug_open;
        let before_git = settings.git_open;
        let before_tab = settings.dock_tab.clone();
        let before_expanded = settings.dock_expanded;
        let _ = super::remember_root_value(&mut settings, "/tmp".to_string()).expect("ok");
        assert_eq!(settings.last_root, before_last);
        assert_eq!(settings.open_files, before_open);
        assert_eq!(settings.active_file, before_active);
        assert_eq!(settings.rail_collapsed, before_rail);
        assert_eq!(settings.debug_open, before_debug);
        assert_eq!(settings.git_open, before_git);
        assert_eq!(settings.dock_tab, before_tab);
        assert_eq!(settings.dock_expanded, before_expanded);
    }

    #[test]
    fn preferences_default_when_the_file_has_none() {
        let parsed: Settings = serde_json::from_str("{}").expect("parses");
        assert_eq!(parsed.preferences.editor_font_size, 13.0);
        assert_eq!(parsed.preferences.editor_tab_size, 4);
        assert_eq!(parsed.preferences.terminal_font_size, 13.0);
        assert!(!parsed.preferences.format_on_save);
        assert_eq!(parsed.preferences.build_profile, "debug");
        assert_eq!(parsed.preferences.panel_sizes.rail_width, 240.0);
        assert_eq!(parsed.preferences.panel_sizes.debug_width, 320.0);
        assert_eq!(parsed.preferences.panel_sizes.dock_height, 260.0);
        assert_eq!(parsed.preferences.panel_sizes.terminal_height, 180.0);
    }

    #[test]
    fn unusable_preferences_are_clamped_on_read() {
        let parsed: Settings = serde_json::from_str(
            r#"{"preferences":{"editorFontSize":400,"editorTabSize":3,"terminalFontSize":1,"buildProfile":"fast","panelSizes":{"railWidth":10,"debugWidth":9999,"dockHeight":0,"terminalHeight":42}}}"#,
        )
        .expect("parses");

        let preferences = parsed.preferences;
        assert_eq!(preferences.editor_font_size, 24.0);
        assert_eq!(preferences.editor_tab_size, 4);
        assert_eq!(preferences.terminal_font_size, 9.0);
        assert_eq!(preferences.build_profile, "debug");
        assert_eq!(preferences.panel_sizes.rail_width, 160.0);
        assert_eq!(preferences.panel_sizes.debug_width, 640.0);
        assert_eq!(preferences.panel_sizes.dock_height, 120.0);
        assert_eq!(preferences.panel_sizes.terminal_height, 100.0);
    }

    #[test]
    fn a_valid_preferences_block_survives_a_round_trip() {
        let parsed: Settings = serde_json::from_str(
            r#"{"preferences":{"editorFontSize":15,"editorTabSize":2,"terminalFontSize":16,"formatOnSave":true,"buildProfile":"release","panelSizes":{"railWidth":300,"debugWidth":420,"dockHeight":340,"terminalHeight":220}}}"#,
        )
        .expect("parses");
        let text = serde_json::to_string_pretty(&parsed).expect("serializes");
        let back: Settings = serde_json::from_str(&text).expect("parses");

        assert_eq!(back.preferences.editor_font_size, 15.0);
        assert_eq!(back.preferences.editor_tab_size, 2);
        assert_eq!(back.preferences.terminal_font_size, 16.0);
        assert!(back.preferences.format_on_save);
        assert_eq!(back.preferences.build_profile, "release");
        assert_eq!(back.preferences.panel_sizes.rail_width, 300.0);
        assert_eq!(back.preferences.panel_sizes.terminal_height, 220.0);
    }

    #[test]
    fn project_settings_round_trip_through_the_project_directory() {
        let root = temp_project("settings-round-trip");
        let settings = super::ProjectSettings {
            editor_tab_size: Some(2),
            format_on_save: Some(true),
            build_profile: Some("release".to_string()),
        };
        super::write_project_settings(root.clone(), settings.clone()).expect("writes");

        let file = std::path::Path::new(&root).join(".quarry").join("settings.json");
        assert!(file.is_file(), "settings file missing at {}", file.display());
        assert_eq!(super::read_project_settings(root.clone()), settings);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn corrupt_project_settings_read_as_defaults() {
        let root = temp_project("settings-corrupt");
        let dir = std::path::Path::new(&root).join(".quarry");
        std::fs::create_dir_all(&dir).expect("creates .quarry");
        std::fs::write(dir.join("settings.json"), "{not json").expect("writes");

        assert_eq!(
            super::read_project_settings(root.clone()),
            super::ProjectSettings::default()
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn project_settings_need_an_absolute_existing_root() {
        let err = super::write_project_settings(
            "relative/project".to_string(),
            super::ProjectSettings::default(),
        )
        .unwrap_err();
        assert!(err.contains("absolute"), "unexpected error: {err}");

        let err = super::write_project_settings(
            "/definitely/missing/quarry-project".to_string(),
            super::ProjectSettings::default(),
        )
        .unwrap_err();
        assert!(err.contains("does not exist"), "unexpected error: {err}");

        assert_eq!(
            super::read_project_settings("/definitely/missing/quarry-project".to_string()),
            super::ProjectSettings::default()
        );
    }

    #[test]
    fn an_unknown_project_setting_value_reads_as_inherited() {
        let root = temp_project("settings-unknown");
        let dir = std::path::Path::new(&root).join(".quarry");
        std::fs::create_dir_all(&dir).expect("creates .quarry");
        std::fs::write(
            dir.join("settings.json"),
            r#"{"editorTabSize":5,"buildProfile":"fast"}"#,
        )
        .expect("writes");

        let parsed = super::read_project_settings(root.clone());
        assert!(parsed.editor_tab_size.is_none(), "tab size 5 is not offered");
        assert!(parsed.build_profile.is_none(), "fast is not a build profile");

        let _ = std::fs::remove_dir_all(&root);
    }

    /// A throwaway project directory named after the calling test.
    fn temp_project(label: &str) -> String {
        let dir = std::env::temp_dir().join(format!(
            "quarry-settings-{}-{label}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("creates the temp project");
        dir.to_string_lossy().into_owned()
    }
}
