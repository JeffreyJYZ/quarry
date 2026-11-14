//! The target rows a plan reports, and the program each one launches.
//!
//! The configuration the build was asked for decides which artifact a row names: a multi-config tree
//! has one executable per configuration, and Run launches the one being built.
//!
//! A plan is read by another process with its own working directory, so a program is never left
//! relative to the tree. The conventional-file fallback answers from the tree — `build/Debug/name` —
//! and a caller that spawned that from anywhere but the project directory would miss the binary.

use std::path::{Path, PathBuf};

use crate::build_task::{BuildProfile, external};
use crate::launch::{list_targets, resolve_target_in};

use super::Target;

/// Every target the project offers, with the program its next build writes.
pub fn plan_targets(root: &str, profile: BuildProfile) -> Vec<Target> {
    list_targets(root)
        .unwrap_or_default()
        .into_iter()
        .map(|target| {
            let resolved = resolve_target_in(root, &target.id, false, Some(profile.cmake_config()));
            Target {
                id: target.id,
                label: target.label,
                kind: target.kind,
                target: target.target,
                program: resolved
                    .as_ref()
                    .ok()
                    .map(|config| external(&rooted(root, &config.program))),
                error: resolved.err(),
            }
        })
        .collect()
}

/// A program path made absolute against the project it belongs to.
pub fn rooted(root: &str, program: &str) -> PathBuf {
    let path = Path::new(program);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        Path::new(root).join(path)
    }
}

#[cfg(test)]
mod tests {
    use super::rooted;
    use std::path::Path;

    #[test]
    fn a_relative_program_is_rooted_at_the_project() {
        let root = if cfg!(windows) { r"C:\tree" } else { "/tree" };
        let expected = Path::new(root).join("build").join("Debug").join("app");
        assert_eq!(rooted(root, "build/Debug/app"), expected);
    }

    #[test]
    fn an_absolute_program_is_left_alone() {
        let program = if cfg!(windows) {
            r"C:\elsewhere\app.exe"
        } else {
            "/elsewhere/app"
        };
        assert_eq!(rooted("/tree", program), Path::new(program));
    }
}
