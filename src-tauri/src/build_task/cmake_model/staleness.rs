//! Whether a build has to configure before it compiles.
//!
//! A CMake tree describes itself in its manifest, its presets and its toolchain file, and only a
//! configure turns that description into build rules, a project model and a compiler database.
//! Quarry used to configure on every build, so an unchanged project paid for one; before that it
//! configured only once, so a new target never reached the model. CLion reloads its model when
//! those files change, and that is the rule here.
//!
//! What "newer" compares against is the last *successful* configure, and the file API index is what
//! records it: CMake writes an index at the end of every configure that succeeds and none for one
//! that fails, while `CMakeCache.txt` is left alone once the cache exists — a no-op configure keeps
//! that file's timestamp at the first configure's. The index also proves generation finished, so a
//! build directory whose generated files were deleted is rebuilt rather than reported as current.
//! A failed configure therefore stays stale until one succeeds, which keeps a broken project
//! reported as broken; a tree with no reply predates our query or never finished a configure, and is
//! configured again.
//!
//! [`super::model_inputs`] decides which files count. Detail: the comparison lives in `build_task`
//! because the build is what must decide it. The LSP hand-off keeps its own narrower check
//! (`lsp/handoff/freshness.rs`, which scans two levels and compares nothing else) and should adopt
//! [`super::model_inputs`] when its lane is next touched.

#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::time::SystemTime;

use super::*;

/// The cache entry naming the build type a single-config tree was configured for.
pub const BUILD_TYPE_VARIABLE: &str = "CMAKE_BUILD_TYPE";

/// What this build's configure must carry, independent of any file's timestamp.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ConfigureIntent {
    /// The toolchain file the plan would pass, absolute and already expanded from its preset.
    pub toolchain: Option<PathBuf>,
    /// The build type the plan would force, when the generator needs one on the command line.
    pub build_type: Option<String>,
}

/// Why a configure is needed, when one is.
#[derive(Clone, Debug, PartialEq)]
pub enum ConfigureNeed {
    /// The build tree holds no configure output: this is its first build.
    First,
    /// Something the configure reads changed; the note is the line the report leads with.
    Changed(String),
}

/// Whether this build must configure first, and the one line worth reporting when it must.
pub fn configure_need(
    source_root: &Path,
    build_root: &Path,
    intent: &ConfigureIntent,
) -> Option<ConfigureNeed> {
    if let Some(note) = value_drift(source_root, build_root, intent) {
        return Some(ConfigureNeed::Changed(note));
    }
    let inputs = model_inputs(source_root, build_root, intent.toolchain.as_deref());
    let Some(anchor) = configure_output(build_root) else {
        return Some(ConfigureNeed::First);
    };
    newest_after(&inputs, anchor)
        .map(|path| ConfigureNeed::Changed(changed_note(source_root, path)))
}

/// When this tree last finished a configure, or `None` when it never has.
///
/// The reply index is the record, and the cache is not: CMake leaves the cache's timestamp where
/// the first configure put it, so a cache-only tree cannot say whether generation finished.
pub fn configure_output(build_root: &Path) -> Option<SystemTime> {
    newest_index(build_root)
        .ok()
        .and_then(|path| modified(&path))
}

/// A configure value that differs from the one the tree was configured with.
fn value_drift(source_root: &Path, build_root: &Path, intent: &ConfigureIntent) -> Option<String> {
    if let Some(toolchain) = &intent.toolchain
        && let Some(value) = cache_value(build_root, TOOLCHAIN_VARIABLE)
    {
        let configured = resolve_input(source_root, Path::new(&value));
        if !same_file(&configured, toolchain) {
            return Some(format!(
                "{} replaces the toolchain the tree was configured with, so cmake configured again",
                toolchain.display()
            ));
        }
    }
    let wanted = intent.build_type.as_deref()?;
    let configured = cache_value(build_root, BUILD_TYPE_VARIABLE)?;
    (!configured.eq_ignore_ascii_case(wanted)).then(|| {
        format!("the tree was configured for {configured}, so this {wanted} build configured it")
    })
}

/// The newest input written after `anchor`, which is the one the note names.
fn newest_after(inputs: &[PathBuf], anchor: SystemTime) -> Option<&PathBuf> {
    inputs
        .iter()
        .filter_map(|path| Some((path, modified(path)?)))
        .filter(|(_, time)| *time > anchor)
        .max_by_key(|(_, time)| *time)
        .map(|(path, _)| path)
}

fn changed_note(source_root: &Path, path: &Path) -> String {
    let name = path.strip_prefix(source_root).unwrap_or(path);
    format!(
        "{} is newer than the last configure, so cmake configured again",
        name.display()
    )
}

fn same_file(left: &Path, right: &Path) -> bool {
    left == right
        || matches!(
            (fs::canonicalize(left), fs::canonicalize(right)),
            (Ok(left), Ok(right)) if left == right
        )
}

fn modified(path: &Path) -> Option<SystemTime> {
    fs::metadata(path).ok()?.modified().ok()
}
