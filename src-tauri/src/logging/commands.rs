//! What the renderer reports: an error its boundary caught, and where to read it afterwards.

use super::global;
use super::level::Level;

/// Record an error the React boundary caught and answer the log path, so the panel can print it.
///
/// Both sides are deliberate: the command never fails, because a log that cannot be written must
/// not mask the error that brought the user to the panel, and it returns the path rather than
/// making the renderer ask for a second command while it is inside a crash.
#[tauri::command]
pub fn log_ui_error(
    region: Option<String>,
    name: String,
    message: String,
    stack: Option<String>,
    component_stack: Option<String>,
) -> String {
    let mut text = format!("{name}: {message}");
    if let Some(region) = region.as_deref() {
        text.push_str(&format!(" (in {region})"));
    }
    if let Some(stack) = stack.as_deref() {
        text.push_str("\nstack:\n");
        text.push_str(stack.trim_end());
    }
    if let Some(component_stack) = component_stack.as_deref() {
        text.push_str("\ncomponent stack:\n");
        text.push_str(component_stack.trim_end());
    }
    global::write(Level::Error, "ui", &text);
    global::log_path().to_string_lossy().to_string()
}

/// The log file's path, for a panel that wants to name it before anything has failed.
#[tauri::command]
pub fn log_path() -> String {
    global::log_path().to_string_lossy().to_string()
}
