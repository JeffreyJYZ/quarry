#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use std::fs;
pub use std::path::PathBuf;
pub use tauri::{AppHandle, Manager};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_1 {
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
    pub fn missing_fields_default_to_empty() {
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
    pub fn unknown_dock_tab_falls_back() {
        let parsed: Settings = serde_json::from_str(r#"{"dockTab":"bogus"}"#).expect("parses");
        assert_eq!(parsed.dock_tab, "problems");
    }

    #[test]
    pub fn roundtrip_keeps_every_field() {
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
    pub fn run_configuration_round_trips() {
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
    pub fn a_legacy_file_without_run_configurations_still_loads() {
        let parsed: Settings = serde_json::from_str(
            r#"{"lastRoot":"/tmp/p","openFiles":["/tmp/p/src/main.rs"],"activeFile":null,"railCollapsed":true,"dockTab":"run"}"#,
        )
        .expect("a settings file written before run configurations parses");

        assert_eq!(parsed.last_root.as_deref(), Some("/tmp/p"));
        assert_eq!(parsed.dock_tab, "run");
        assert!(parsed.run_configurations.is_empty());
    }

    #[test]
    pub fn empty_run_configuration_names_are_dropped_on_read() {
        let parsed: Settings = serde_json::from_str(
            r#"{"runConfigurations":[{"name":"  ","program":"a"},{"name":" run ","program":"b"}]}"#,
        )
        .expect("parses");

        assert_eq!(parsed.run_configurations.len(), 1);
        assert_eq!(parsed.run_configurations[0].name, "run");
        assert_eq!(parsed.run_configurations[0].program, "b");
    }

    #[test]
    pub fn duplicate_run_configuration_names_keep_the_first_on_read() {
        let parsed: Settings = serde_json::from_str(
            r#"{"runConfigurations":[{"name":"run","program":"a"},{"name":" run","program":"b"}]}"#,
        )
        .expect("parses");

        assert_eq!(parsed.run_configurations.len(), 1);
        assert_eq!(parsed.run_configurations[0].program, "a");
    }

    #[test]
    pub fn a_configuration_without_optional_fields_parses() {
        let parsed: Settings =
            serde_json::from_str(r#"{"runConfigurations":[{"name":"bare"}]}"#).expect("parses");

        let config = &parsed.run_configurations[0];
        assert_eq!(config.name, "bare");
        assert!(config.program.is_empty());
        assert!(config.args.is_empty());
        assert!(config.cwd.is_empty());
        assert!(config.env.is_empty());
    }
}
