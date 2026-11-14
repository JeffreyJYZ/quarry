#![allow(unused_imports)]

//! A key written by another build must survive this build's read, edit and save.

pub use serde::{Deserialize, Serialize};
pub use std::fs;
pub use std::path::PathBuf;
pub use tauri::{AppHandle, Manager};

use super::*;

#[cfg(test)]
mod tests_extra_round_trip {
    use super::{Preferences, ProjectSettings, Settings};

    #[test]
    fn an_unknown_preference_key_survives_a_read_modify_write() {
        let parsed: Settings =
            serde_json::from_str(r#"{"preferences":{"editorFontSize":15,"futureKnob":7}}"#)
                .expect("parses");
        let mut settings = parsed;
        // The modify step every save makes: this build changes one field it does know.
        settings.last_root = Some("/tmp/project".to_string());

        let text = serde_json::to_string_pretty(&settings).expect("serializes");
        assert!(
            text.contains("\"futureKnob\": 7"),
            "the unknown key was dropped from the file: {text}"
        );

        let back: Settings = serde_json::from_str(&text).expect("parses");
        assert_eq!(
            back.preferences.extra.get("futureKnob"),
            Some(&serde_json::json!(7))
        );
        assert_eq!(back.preferences.editor_font_size, 15.0);
    }

    #[test]
    fn normalizing_preferences_keeps_the_extra_map() {
        let mut preferences = Preferences {
            editor_font_size: 400.0,
            ..Default::default()
        };
        preferences
            .extra
            .insert("futureKnob".to_string(), serde_json::json!(7));

        preferences.normalize();

        assert_eq!(
            preferences.editor_font_size, 24.0,
            "the clamp still applies"
        );
        assert_eq!(
            preferences.extra.get("futureKnob"),
            Some(&serde_json::json!(7)),
            "normalisation dropped a key it does not own"
        );
    }

    #[test]
    fn an_unknown_project_setting_survives_a_read_modify_write() {
        let parsed: ProjectSettings =
            serde_json::from_str(r#"{"formatOnSave":true,"futureOverride":"keep"}"#)
                .expect("parses");
        let mut settings = parsed;
        settings.build_profile = Some("release".to_string());

        let text = serde_json::to_string_pretty(&settings).expect("serializes");
        assert!(
            text.contains("\"futureOverride\": \"keep\""),
            "the unknown key was dropped from the file: {text}"
        );

        let back: ProjectSettings = serde_json::from_str(&text).expect("parses");
        assert_eq!(
            back.extra.get("futureOverride"),
            Some(&serde_json::json!("keep"))
        );
        assert_eq!(back.format_on_save, Some(true));
        assert_eq!(back.build_profile.as_deref(), Some("release"));
    }

    #[test]
    fn a_run_form_round_trips_through_the_settings_file() {
        let parsed: Settings = serde_json::from_str(
            r#"{"runForms":[{"root":"/p","program":"/p/custom","args":"--manual","cwd":"/p/sub","env":[["A","1"]]}]}"#,
        )
        .expect("parses");

        assert_eq!(parsed.run_forms.len(), 1);
        let form = &parsed.run_forms[0];
        assert_eq!(form.root, "/p");
        assert_eq!(form.program, "/p/custom");
        assert_eq!(form.env, vec![("A".to_string(), "1".to_string())]);

        let text = serde_json::to_string(&parsed).expect("serializes");
        assert!(
            text.contains("\"runForms\""),
            "the field was dropped: {text}"
        );
        let back: Settings = serde_json::from_str(&text).expect("parses");
        assert_eq!(back.run_forms, parsed.run_forms);
    }

    #[test]
    fn a_rootless_or_duplicate_run_form_is_dropped_on_read() {
        let parsed: Settings = serde_json::from_str(
            r#"{"runForms":[{"root":"  ","program":"a"},{"root":"/p","program":"first"},{"root":" /p ","program":"second"}]}"#,
        )
        .expect("parses");

        assert_eq!(parsed.run_forms.len(), 1);
        assert_eq!(parsed.run_forms[0].root, "/p");
        assert_eq!(parsed.run_forms[0].program, "first");
    }

    #[test]
    fn a_settings_file_without_run_forms_still_loads() {
        let parsed: Settings = serde_json::from_str(r#"{"lastRoot":"/p"}"#).expect("parses");

        assert!(parsed.run_forms.is_empty());
    }
}
