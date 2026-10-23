#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use std::fs;
pub use std::path::PathBuf;
pub use tauri::{AppHandle, Manager};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_3 {
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
    pub fn unusable_preferences_are_clamped_on_read() {
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
    pub fn a_valid_preferences_block_survives_a_round_trip() {
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
    pub fn project_settings_round_trip_through_the_project_directory() {
        let root = temp_project("settings-round-trip");
        let settings = super::ProjectSettings {
            editor_tab_size: Some(2),
            format_on_save: Some(true),
            build_profile: Some("release".to_string()),
        };
        super::write_project_settings(root.clone(), settings.clone()).expect("writes");

        let file = std::path::Path::new(&root)
            .join(".quarry")
            .join("settings.json");
        assert!(
            file.is_file(),
            "settings file missing at {}",
            file.display()
        );
        assert_eq!(super::read_project_settings(root.clone()), settings);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    pub fn corrupt_project_settings_read_as_defaults() {
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
    pub fn project_settings_need_an_absolute_existing_root() {
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
    pub fn an_unknown_project_setting_value_reads_as_inherited() {
        let root = temp_project("settings-unknown");
        let dir = std::path::Path::new(&root).join(".quarry");
        std::fs::create_dir_all(&dir).expect("creates .quarry");
        std::fs::write(
            dir.join("settings.json"),
            r#"{"editorTabSize":5,"buildProfile":"fast"}"#,
        )
        .expect("writes");

        let parsed = super::read_project_settings(root.clone());
        assert!(
            parsed.editor_tab_size.is_none(),
            "tab size 5 is not offered"
        );
        assert!(
            parsed.build_profile.is_none(),
            "fast is not a build profile"
        );

        let _ = std::fs::remove_dir_all(&root);
    }
}
