//! Reading settings without throwing away the ones that still parse.
//!
//! The old read chained `ok()` into `ok()` into `unwrap_or_default()`, so one bad value or a
//! truncated tail silently dropped the whole file: last root, open files, recent roots and run
//! configurations. A file that cannot be parsed at all is now kept as a `.bad` sibling and the
//! failure is reported; a file with only some bad fields keeps every field that does parse.

use std::path::{Path, PathBuf};

use super::*;

/// What a read reports: the settings, and anything the file lost on the way to them.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SettingsRead {
    pub settings: Settings,
    /// Set when a bad value was skipped, so the shell can tell the user instead of forgetting it.
    pub warning: Option<String>,
}

/// Every key `Settings` owns; a per-field repair may drop one of these and nothing else.
const SETTINGS_KEYS: [&str; 13] = [
    "lastRoot",
    "openFiles",
    "activeFile",
    "railCollapsed",
    "debugOpen",
    "gitOpen",
    "dockTab",
    "dockExpanded",
    "recentRoots",
    "runConfigurations",
    "recentFiles",
    "newProjectParent",
    "preferences",
];

/// Every key `ProjectSettings` owns.
const PROJECT_KEYS: [&str; 3] = ["editorTabSize", "formatOnSave", "buildProfile"];

/// The settings file, or the error explaining why it was reset and where the old bytes went.
pub fn read_settings_at(path: &Path) -> Result<SettingsRead, String> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(SettingsRead {
                settings: Settings::default(),
                warning: None,
            });
        }
        Err(error) => return Err(format!("cannot read {}: {error}", path.display())),
    };
    let Ok(text) = std::str::from_utf8(&bytes) else {
        return Err(reset_settings(path, &bytes, "it is not UTF-8"));
    };
    let Some((settings, dropped)) = settings_from_text(text) else {
        return Err(reset_settings(path, &bytes, "it is not a settings object"));
    };
    if dropped.is_empty() {
        return Ok(SettingsRead {
            settings,
            warning: None,
        });
    }
    let dropped_text = dropped.join(", ");
    let warning = match keep_bad(path, &bytes) {
        Ok(bad) => format!(
            "settings.json has {} unreadable value(s) ({dropped_text}), so they were skipped; every other setting loaded and the file is kept at {}",
            dropped.len(),
            bad.display()
        ),
        Err(error) => format!(
            "settings.json has {} unreadable value(s) ({dropped_text}), so they were skipped; every other setting loaded, but the file could not be copied aside: {error}",
            dropped.len()
        ),
    };
    Ok(SettingsRead {
        settings,
        warning: Some(warning),
    })
}

/// The settings a file holds, dropping only the fields serde cannot read.
pub fn settings_from_text(text: &str) -> Option<(Settings, Vec<String>)> {
    parse_tolerant(text, &SETTINGS_KEYS)
}

/// The project overrides a file holds, dropping only the fields serde cannot read.
pub fn project_settings_from_text(text: &str) -> Option<(ProjectSettings, Vec<String>)> {
    parse_tolerant(text, &PROJECT_KEYS)
}

/// Parse `text`, removing one offending key at a time until what is left parses.
///
/// `flatten` makes serde report a bad value without naming the key it came from, so the key is found
/// by removal: the first one whose absence lets the whole document parse is the one that was wrong.
fn parse_tolerant<T: serde::de::DeserializeOwned>(
    text: &str,
    keys: &[&str],
) -> Option<(T, Vec<String>)> {
    let value: serde_json::Value = serde_json::from_str(text).ok()?;
    let mut object = value.as_object()?.clone();
    let mut dropped: Vec<String> = Vec::new();
    loop {
        if let Ok(parsed) = serde_json::from_value::<T>(serde_json::Value::Object(object.clone())) {
            return Some((parsed, dropped));
        }
        let culprit = keys.iter().copied().find(|key| {
            if !object.contains_key(*key) {
                return false;
            }
            let mut candidate = object.clone();
            candidate.remove(*key);
            serde_json::from_value::<T>(serde_json::Value::Object(candidate)).is_ok()
        })?;
        object.remove(culprit);
        dropped.push(culprit.to_string());
    }
}

/// Keep the bytes of a file that could not be used, and say where they went.
fn reset_settings(path: &Path, bytes: &[u8], reason: &str) -> String {
    match keep_bad(path, bytes) {
        Ok(bad) => format!(
            "settings.json was reset because {reason}; the previous file is kept at {}",
            bad.display()
        ),
        Err(error) => format!(
            "settings.json was reset because {reason}; it could not be copied aside: {error}"
        ),
    }
}

/// The `.bad` sibling, written through the same rename so a crash cannot leave half a backup.
pub(crate) fn keep_bad(path: &Path, bytes: &[u8]) -> Result<PathBuf, String> {
    let mut name = path.as_os_str().to_os_string();
    name.push(".bad");
    let bad = PathBuf::from(name);
    write_atomic(&bad, bytes)?;
    Ok(bad)
}
