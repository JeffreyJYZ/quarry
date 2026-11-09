//! Which changed paths are noise.
//!
//! The watcher is recursive, so it also sees build output. Refreshing on those events would rebuild
//! the tree hundreds of times a second during a build, which is worse than the staleness it fixes.

use super::*;

/// Directory names only the watcher ignores, on top of the crate-wide [`crate::ignore::DIRS`].
///
/// `build/` is here and not in the shared list on purpose: quick-open may legitimately show a
/// hand-written `build/` directory, while a watcher that refreshes on its output is pure noise.
pub const EXTRA_EXCLUDED: [&str; 1] = ["build"];

/// Whether a changed path must never reach the frontend.
///
/// A path that is not below `root` is ignored too: the watcher serves exactly one project, and a
/// symlink or a moved directory must not pull in events from elsewhere.
pub fn is_ignored(path: &Path, root: &Path) -> bool {
    let Ok(relative) = path.strip_prefix(root) else {
        return true;
    };
    relative.components().any(|component| match component {
        Component::Normal(name) => name
            .to_str()
            .is_some_and(|name| crate::ignore::is_dir(name) || EXTRA_EXCLUDED.contains(&name)),
        _ => false,
    })
}
