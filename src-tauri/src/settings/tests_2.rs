#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use std::fs;
pub use std::path::PathBuf;
pub use tauri::{AppHandle, Manager};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_2 {
    use super::{RunConfiguration, Settings};

    /// A throwaway project directory named after the calling test.
    pub fn temp_project(label: &str) -> String {
        let dir =
            std::env::temp_dir().join(format!("quarry-settings-{}-{label}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("creates the temp project");
        dir.to_string_lossy().into_owned()
    }

    #[test]
    pub fn fields_from_a_newer_build_survive_a_rewrite() {
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
    pub fn corrupt_file_yields_defaults() {
        let result: Result<Settings, _> = serde_json::from_str("{not json");
        assert!(result.is_err());
    }

    #[test]
    pub fn old_file_parses_with_defaults() {
        let parsed: Settings =
            serde_json::from_str(r#"{"lastRoot":"/tmp/p","openFiles":[],"activeFile":null}"#)
                .expect("old file parses");
        assert_eq!(parsed.last_root.as_deref(), Some("/tmp/p"));
        assert_eq!(parsed.dock_tab, "problems");
        assert!(parsed.recent_roots.is_empty());
    }

    #[test]
    pub fn remember_root_moves_to_front_and_dedupes() {
        let mut settings = Settings {
            recent_roots: vec!["/private/tmp".to_string(), "/tmp".to_string()],
            ..Default::default()
        };
        let list = super::remember_root_value(&mut settings, "/tmp".to_string()).expect("ok");
        assert_eq!(list, vec!["/tmp".to_string(), "/private/tmp".to_string()]);
        assert_eq!(settings.recent_roots, list);
    }

    #[test]
    pub fn remember_root_caps_at_ten() {
        let mut s2 = Settings::default();
        for _ in 0..12 {
            let _ = super::remember_root_value(&mut s2, "/tmp".to_string());
        }
        assert!(s2.recent_roots.len() <= 10);
    }

    #[test]
    pub fn remember_root_rejects_relative() {
        let mut settings = Settings::default();
        let err =
            super::remember_root_value(&mut settings, "relative/project".to_string()).unwrap_err();
        assert!(err.contains("absolute"));
    }

    #[test]
    pub fn missing_directory_dropped_on_read() {
        let parsed: Settings =
            serde_json::from_str(r#"{"recentRoots":["/tmp","/definitely/missing/quarry-dir"]}"#)
                .expect("parses");
        assert_eq!(parsed.recent_roots, vec!["/tmp".to_string()]);
    }

    #[test]
    pub fn unrelated_fields_survive_remember() {
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
    pub fn preferences_default_when_the_file_has_none() {
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
}
