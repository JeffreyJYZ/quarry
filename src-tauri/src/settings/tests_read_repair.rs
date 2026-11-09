#![allow(unused_imports)]

//! A read must keep every setting it can still use, and keep the file it cannot use.

pub use serde::{Deserialize, Serialize};
pub use std::fs;
pub use std::path::PathBuf;
pub use tauri::{AppHandle, Manager};

use super::*;

#[cfg(test)]
mod tests_repair {
    use super::*;

    fn fixture(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "quarry-settings-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create fixture");
        dir
    }

    fn entries(dir: &std::path::Path) -> Vec<String> {
        fs::read_dir(dir)
            .expect("list")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().to_string())
            .collect()
    }

    #[test]
    fn a_missing_file_reads_as_defaults_without_an_error() {
        let dir = fixture("read-missing");
        let read = read_settings_at(&dir.join("settings.json")).expect("missing is not a failure");
        assert!(read.warning.is_none());
        assert!(read.settings.last_root.is_none());
        assert!(read.settings.open_files.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_healthy_file_reads_without_a_warning() {
        let dir = fixture("read-healthy");
        let path = dir.join("settings.json");
        fs::write(
            &path,
            r#"{"lastRoot":"/tmp/project","openFiles":["/tmp/a.rs"]}"#,
        )
        .expect("writes");

        let read = read_settings_at(&path).expect("parses");
        assert!(read.warning.is_none());
        assert_eq!(read.settings.last_root.as_deref(), Some("/tmp/project"));
        assert_eq!(read.settings.open_files, vec!["/tmp/a.rs".to_string()]);
        assert!(!dir.join("settings.json.bad").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    /// The regression: a truncated tail used to default the whole file, so the last root, every open
    /// tab and the run configurations vanished with nothing written down.
    #[test]
    fn a_truncated_file_is_kept_as_bad_and_the_read_reports_an_error() {
        let dir = fixture("read-truncated");
        let path = dir.join("settings.json");
        let original = r#"{"lastRoot":"/tmp/project","openFiles":["/tmp/project/src/main.rs""#;
        fs::write(&path, original).expect("writes");

        let error = read_settings_at(&path).expect_err("a corrupt file is reported, not defaulted");
        assert!(error.contains("reset"), "unexpected error: {error}");
        assert_eq!(
            fs::read_to_string(dir.join("settings.json.bad")).expect("the bad file is kept"),
            original
        );
        assert_eq!(
            fs::read_to_string(&path).expect("the file stays where it was"),
            original,
            "a read must not rewrite the file it could not use"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    /// A backup is only useful if it is whole: the `.bad` copy goes through the same rename, so it is
    /// either absent or byte-complete and never a half-written sibling beside a stray temp file.
    #[test]
    fn the_bad_copy_is_whole_and_leaves_no_temporary_file() {
        let dir = fixture("read-bad-atomic");
        let path = dir.join("settings.json");
        let original = "{\"openFiles\":[1,2";
        fs::write(&path, original).expect("writes");

        let _ = read_settings_at(&path).expect_err("corrupt stays corrupt");

        let mut names = entries(&dir);
        names.sort();
        assert_eq!(
            names,
            vec!["settings.json".to_string(), "settings.json.bad".to_string()],
            "a temporary file survived, or the backup is missing"
        );
        assert_eq!(
            fs::read_to_string(dir.join("settings.json.bad")).expect("reads"),
            original
        );
        let _ = fs::remove_dir_all(&dir);
    }

    /// One bad field must cost that field and nothing else: the same file also holds the root, the
    /// recent files, a run configuration and a key this build does not know.
    #[test]
    fn one_bad_field_keeps_every_other_field() {
        let dir = fixture("read-bad-field");
        let path = dir.join("settings.json");
        fs::write(
            &path,
            r#"{"lastRoot":"/tmp/project","openFiles":"not a list","recentFiles":["/tmp/a.rs"],"runConfigurations":[{"name":"run","program":"a"}],"futureFlag":true}"#,
        )
        .expect("writes");

        let read = read_settings_at(&path).expect("the rest of the file is still usable");
        assert_eq!(read.settings.last_root.as_deref(), Some("/tmp/project"));
        assert!(
            read.settings.open_files.is_empty(),
            "the unreadable field falls back to its default"
        );
        assert_eq!(read.settings.recent_files, vec!["/tmp/a.rs".to_string()]);
        assert_eq!(read.settings.run_configurations.len(), 1);
        assert_eq!(
            read.settings.extra.get("futureFlag"),
            Some(&serde_json::Value::Bool(true))
        );
        let warning = read.warning.expect("the user is told a value was skipped");
        assert!(
            warning.contains("openFiles"),
            "unexpected warning: {warning}"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_corrupt_project_file_is_kept_and_reads_as_defaults() {
        let dir = fixture("read-project-bad");
        let project = dir.join("project");
        let quarry = project.join(".quarry");
        fs::create_dir_all(&quarry).expect("creates .quarry");
        let file = quarry.join("settings.json");
        fs::write(&file, "{not json").expect("writes");

        let settings = read_project_settings(project.to_string_lossy().into_owned());
        assert_eq!(settings, ProjectSettings::default());
        assert_eq!(
            fs::read_to_string(quarry.join("settings.json.bad")).expect("kept"),
            "{not json"
        );
        let _ = fs::remove_dir_all(&dir);
    }
}
