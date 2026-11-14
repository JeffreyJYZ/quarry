//! The breadcrumbs worth keeping, and nothing else: app start, project open, and each server
//! session's start and exit. Each is one line with the id a report can be matched against.

use super::global;
use super::level::Level;

/// Version and platform, so a report says which build produced it.
pub fn app_start() {
    global::write(
        Level::Info,
        "app",
        &format!(
            "quarry {} on {} {}",
            env!("CARGO_PKG_VERSION"),
            std::env::consts::OS,
            std::env::consts::ARCH
        ),
    );
}

pub fn project_opened(path: &str, kind: &str) {
    global::write(Level::Info, "project", &format!("open {path} ({kind})"));
}

pub fn project_failed(path: &str, error: &str) {
    global::write(
        Level::Error,
        "project",
        &format!("open failed {path}: {error}"),
    );
}

pub fn lsp_started(root: &str, server: &str) {
    global::write(Level::Info, "lsp", &format!("start {server} {root}"));
}

pub fn lsp_failed(root: &str, error: &str) {
    global::write(
        Level::Error,
        "lsp",
        &format!("start failed {root}: {error}"),
    );
}

pub fn lsp_exited(root: &str, status: &str) {
    global::write(Level::Info, "lsp", &format!("exit {root} {status}"));
}

pub fn dap_started(id: &str, program: &str) {
    global::write(Level::Info, "dap", &format!("start {id} {program}"));
}

pub fn dap_failed(what: &str, error: &str) {
    global::write(
        Level::Error,
        "dap",
        &format!("start failed {what}: {error}"),
    );
}

pub fn dap_exited(id: &str, status: &str) {
    global::write(Level::Info, "dap", &format!("exit {id} {status}"));
}
