//! The process-wide sink and the one call every writer goes through.

use std::path::PathBuf;
use std::sync::OnceLock;

use super::level::Level;
use super::line;
use super::panic_hook;
use super::paths;
use super::sink::Sink;
use super::stamp;

static SINK: OnceLock<Sink> = OnceLock::new();

/// Opens the log, installs the panic hook and writes the first line. Called once, first thing.
pub fn install() {
    let _ = SINK.set(Sink::new(paths::log_file()));
    panic_hook::install();
    super::breadcrumbs::app_start();
}

/// Append one entry. A sink that has not been installed, or a write that fails, does nothing: the
/// log may never break the app it documents.
pub(crate) fn write(level: Level, target: &str, message: &str) {
    let Some(sink) = SINK.get() else {
        return;
    };
    let text = line::format(&stamp::now_stamp(), level, target, message);
    let _ = sink.write_line(&text);
}

/// Where the log is, whether or not a line has been written yet.
pub fn log_path() -> PathBuf {
    paths::log_file()
}
