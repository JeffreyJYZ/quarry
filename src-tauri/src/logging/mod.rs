//! The crash log: one append-only file under the platform's log directory.
//!
//! Why a `Mutex<File>` rather than `tauri-plugin-log`: the plugin is not a dependency here, and the
//! whole surface needed is a header line, a rotation at 2 MB and a flush per write. A few dozen
//! lines of `std::io` do that without adding a crate to the tree or to the bundle.
//!
//! Scope is deliberate — a crash log, not a tracing framework. Four kinds of line are written: app
//! start, project open, language server and debug adapter start and exit, and failures (a panic, or
//! an error the renderer caught). Anything more buries the line a bug report needs.
//!
//! Failure never propagates: a log that cannot be written stays silent instead of breaking the app
//! it documents, and the panic hook runs before the default hook so stderr is unchanged.

mod breadcrumbs;
mod commands;
mod global;
mod level;
mod line;
mod panic_hook;
mod paths;
mod sink;
mod stamp;

#[cfg(test)]
mod tests_format;
#[cfg(test)]
mod tests_panic;
#[cfg(test)]
mod tests_rotate;

pub use breadcrumbs::*;
pub use commands::*;
pub use global::install;
