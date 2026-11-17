//! Pins the builder's constants to `tauri.conf.json`, and the label scan to its purpose.

use super::*;
use serde_json::Value;

/// The conf, read where cargo runs the test rather than guessed at a relative path.
fn conf() -> Value {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json");
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("cannot read {}: {error}", path.display()));
    serde_json::from_str(&text)
        .unwrap_or_else(|error| panic!("cannot parse {}: {error}", path.display()))
}

/// The single window entry the conf declares. A second entry is a failure of its own: the test is
/// about the window a new one matches, so an ambiguous conf would make it meaningless.
fn declared_window() -> Value {
    let windows = conf()["app"]["windows"]
        .as_array()
        .expect("app.windows should be an array")
        .clone();
    assert_eq!(
        windows.len(),
        1,
        "the conf should declare exactly one window; a new one is built from the contract"
    );
    windows.into_iter().next().expect("one window")
}

#[test]
fn the_builder_matches_the_window_the_conf_declares() {
    let window = declared_window();

    // The conf declares no `url`, so the window it opens loads the framework's default, which is
    // the path the builder names.
    assert_eq!(
        window.get("url"),
        None,
        "the conf should not override the url"
    );
    assert_eq!(
        serde_json::to_value(WebviewUrl::default()).expect("a url serialises"),
        Value::String(URL.to_string())
    );
    assert_eq!(window["title"].as_str(), Some(TITLE));
    assert_eq!(window["width"].as_f64(), Some(WIDTH));
    assert_eq!(window["height"].as_f64(), Some(HEIGHT));
    assert_eq!(window["minWidth"].as_f64(), Some(MIN_WIDTH));
    assert_eq!(window["minHeight"].as_f64(), Some(MIN_HEIGHT));
    assert_eq!(
        window["theme"].as_str(),
        Some(if DARK { "Dark" } else { "Light" })
    );
    assert_eq!(
        window["titleBarStyle"].as_str(),
        Some(contract::title_bar_style().to_string().as_str()),
        "the conf's title bar style must match the one the builder applies"
    );
    assert_eq!(window["hiddenTitle"].as_bool(), Some(HIDDEN_TITLE));
}

#[test]
fn the_command_is_registered_under_the_contract_name() {
    // The contract names the command `new_window`, and the function carries the same name so the
    // `generate_handler!` scan in `src/lib/project/api/commands.test.ts` can see it.
    assert_eq!(
        __tauri_command_name_new_window!(),
        "new_window",
        "the IPC command must be called new_window"
    );
}

#[test]
fn the_first_label_after_main_is_window_2() {
    assert_eq!(next_label(&[MAIN_LABEL.to_string()]), "window-2");
}

#[test]
fn the_next_label_is_never_one_already_alive() {
    let live: Vec<String> = ["main", "window-2", "window-3", "window-5"]
        .iter()
        .map(|label| (*label).to_string())
        .collect();

    let label = next_label(&live);

    assert!(
        !live.contains(&label),
        "{label} was handed out while already alive"
    );
    assert_eq!(label, "window-4", "the first free index should win");
}

#[test]
fn a_closed_window_frees_its_number_again() {
    // Two live windows mean the third is taken, but closing it must hand the same number back
    // rather than climbing past it.
    let before = next_label(&["main".to_string(), "window-2".to_string()]);
    assert_eq!(before, "window-3");

    let after_closing_2 = next_label(&["main".to_string(), "window-3".to_string()]);
    assert_eq!(after_closing_2, "window-2");
}

#[test]
fn a_set_of_live_labels_produces_a_label_not_in_it() {
    let live: Vec<String> = ["main", "window-2", "window-4", "window-5"]
        .iter()
        .map(|label| (*label).to_string())
        .collect();

    // Each repeated call using the previous answer as live must never repeat.
    let mut seen: Vec<String> = live.clone();
    for _ in 0..6 {
        let label = next_label(&seen);
        assert!(!seen.contains(&label), "handed out {label} twice");
        seen.push(label);
    }
    assert_eq!(seen.len(), live.len() + 6);
}
