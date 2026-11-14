//! Where the log file lives, per platform.
//!
//! macOS puts application logs under `~/Library/Logs` (Console reads them there), Windows under
//! `%LOCALAPPDATA%`, and Linux follows `$XDG_STATE_HOME`. The pure function below takes the inputs
//! so all three layouts are tested on whichever machine runs the suite; `log_dir` only resolves the
//! environment and hands them over.

use std::path::{Path, PathBuf};

/// Directory name under the platform's log root.
const APP_DIR: &str = "quarry";
/// The one file this app appends to; rotation adds a `.1` beside it.
const FILE_NAME: &str = "quarry.log";

/// The log directory for `os` (`macos`, `windows`, or anything else as Linux).
pub fn log_dir(
    os: &str,
    home: &Path,
    local_appdata: Option<&Path>,
    xdg_state: Option<&Path>,
) -> PathBuf {
    match os {
        "windows" => local_appdata
            .map(Path::to_path_buf)
            .unwrap_or_else(|| home.join("AppData").join("Local"))
            .join(APP_DIR)
            .join("logs"),
        "macos" => home.join("Library").join("Logs").join(APP_DIR),
        _ => xdg_state
            .map(Path::to_path_buf)
            .unwrap_or_else(|| home.join(".local").join("state"))
            .join(APP_DIR)
            .join("logs"),
    }
}

/// The directory this machine writes to.
pub fn log_dir_now() -> PathBuf {
    let home = home_dir();
    let local_appdata = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let xdg_state = std::env::var_os("XDG_STATE_HOME").map(PathBuf::from);
    log_dir(
        std::env::consts::OS,
        &home,
        local_appdata.as_deref(),
        xdg_state.as_deref(),
    )
}

/// The log file this machine writes to.
pub fn log_file() -> PathBuf {
    log_dir_now().join(FILE_NAME)
}

/// `HOME` on Unix, `USERPROFILE` on Windows; a GUI launch carries both on their own platform.
fn home_dir() -> PathBuf {
    for key in ["HOME", "USERPROFILE"] {
        if let Some(value) = std::env::var_os(key)
            && !value.is_empty()
        {
            return PathBuf::from(value);
        }
    }
    PathBuf::from(".")
}
