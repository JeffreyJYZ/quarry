//! The line shape and the per-platform paths. Both are pure, so all three layouts are checked on
//! whichever machine runs the suite.

use std::path::Path;

use super::level::Level;
use super::line;
use super::paths;
use super::stamp;

#[test]
fn a_timestamp_is_utc_and_fixed_width() {
    assert_eq!(stamp::format_stamp(0), "1970-01-01T00:00:00Z");
    // 1_700_000_000 is 2023-11-14T22:13:20Z.
    assert_eq!(stamp::format_stamp(1_700_000_000), "2023-11-14T22:13:20Z");
    // A leap day, so the civil conversion is not only tested on ordinary months.
    assert_eq!(stamp::format_stamp(1_709_164_800), "2024-02-29T00:00:00Z");
}

#[test]
fn a_line_carries_timestamp_level_target_and_message() {
    let text = line::format(
        "2026-11-14T09:12:33Z",
        Level::Error,
        "ui",
        "TypeError: nope",
    );
    assert_eq!(text, "2026-11-14T09:12:33Z ERROR [ui] TypeError: nope");
}

#[test]
fn a_multi_line_message_is_indented_so_one_entry_stays_one_entry() {
    let text = line::format(
        "2026-11-14T09:12:33Z",
        Level::Error,
        "panic",
        "panic at src/a.rs:1:2: boom\nbacktrace:\n0: frame",
    );
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(
        lines[0],
        "2026-11-14T09:12:33Z ERROR [panic] panic at src/a.rs:1:2: boom"
    );
    assert_eq!(lines[1], "    backtrace:");
    assert_eq!(lines[2], "    0: frame");
}

#[test]
fn macos_writes_under_library_logs() {
    let dir = paths::log_dir("macos", Path::new("/Users/me"), None, None);
    assert_eq!(dir, Path::new("/Users/me/Library/Logs/quarry"));
}

#[test]
fn windows_writes_under_local_app_data() {
    let local = Path::new("C:\\Users\\me\\AppData\\Local");
    let dir = paths::log_dir("windows", Path::new("C:\\Users\\me"), Some(local), None);
    assert_eq!(dir, local.join("quarry").join("logs"));
}

#[test]
fn windows_falls_back_when_local_app_data_is_missing() {
    let dir = paths::log_dir("windows", Path::new("C:\\Users\\me"), None, None);
    assert_eq!(
        dir,
        Path::new("C:\\Users\\me")
            .join("AppData")
            .join("Local")
            .join("quarry")
            .join("logs")
    );
}

#[test]
fn linux_follows_the_xdg_state_directory() {
    let state = Path::new("/home/me/.local/state");
    let dir = paths::log_dir("linux", Path::new("/home/me"), None, Some(state));
    assert_eq!(dir, state.join("quarry").join("logs"));
}

#[test]
fn linux_falls_back_to_local_state_when_xdg_is_unset() {
    let dir = paths::log_dir("linux", Path::new("/home/me"), None, None);
    assert_eq!(dir, Path::new("/home/me/.local/state/quarry/logs"));
}

#[test]
fn the_log_path_command_answers_the_platform_file() {
    // Pins the re-export the handler registers: a glob that resolved to the sink's own `log_path`
    // would compile and answer nothing useful to the renderer.
    let answered = super::log_path();
    assert!(
        answered.ends_with("quarry.log"),
        "the command answers the log file: {answered}"
    );
}
