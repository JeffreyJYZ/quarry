//! Registry of the project roots the renderer may touch.
//!
//! `list_dir`, `read_text_file` and `write_text_file` take an absolute path from the webview, so
//! without a registry a renderer bug or a compromised page could read and write anywhere on disk.
//! Every opened project registers its canonical root here and the three commands refuse a path
//! outside all of them.
//!
//! An empty registry is deliberately unrestricted: unit tests and probe scripts work in temporary
//! directories with no project open, and they must keep working.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

static ROOTS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();

fn roots() -> &'static Mutex<HashSet<PathBuf>> {
    ROOTS.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Registers one open project root.
///
/// The root is canonicalised here, so a later comparison never resolves a different path for the
/// same directory. A root that cannot be canonicalised is already unopenable and is ignored.
pub fn register_root(root: &Path) {
    let Ok(canonical) = root.canonicalize() else {
        return;
    };
    let mut roots = match roots().lock() {
        Ok(roots) => roots,
        Err(poisoned) => poisoned.into_inner(),
    };
    roots.insert(canonical);
}

/// Registers the root a renderer just opened.
///
/// A test build skips the registration: the registry is process-wide and the suite opens many
/// throwaway projects, so one registration would restrict every other test's temporary writes.
pub fn register_opened_root(root: &Path) {
    if !cfg!(test) {
        register_root(root);
    }
}

/// Forgets every root, so the registry reads as "no project open" again.
#[cfg(test)]
pub fn clear_roots() {
    let mut roots = match roots().lock() {
        Ok(roots) => roots,
        Err(poisoned) => poisoned.into_inner(),
    };
    roots.clear();
}

/// Refuses a path that lies outside every registered root.
pub fn contained(path: &Path) -> Result<(), String> {
    let roots = match roots().lock() {
        Ok(roots) => roots,
        Err(poisoned) => poisoned.into_inner(),
    };
    contained_in(&roots, path)
}

/// The comparison itself, so it can be exercised without the process-wide registry.
pub(crate) fn contained_in(roots: &HashSet<PathBuf>, path: &Path) -> Result<(), String> {
    if roots.is_empty() {
        return Ok(());
    }
    match resolve(path) {
        Some(target) if roots.iter().any(|root| target.starts_with(root)) => Ok(()),
        _ => Err(format!(
            "cannot access {}: outside every open project",
            path.display()
        )),
    }
}

/// Canonical form of a target: an existing path resolves as-is, which is what turns a symlink
/// pointing outside a root into an outside path. A path that does not exist yet — a new file — is
/// compared through its canonical parent directory and its own name.
///
/// `starts_with` compares whole components, so `/tmp/proj-other` never passes for `/tmp/proj`.
fn resolve(path: &Path) -> Option<PathBuf> {
    if let Ok(canonical) = path.canonicalize() {
        return Some(canonical);
    }
    let parent = path.parent()?.canonicalize().ok()?;
    let name = path.file_name()?;
    Some(parent.join(name))
}
