#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

use super::*;

/// The text CMake prints once a target is up to date: `[100%] Built target <name>`.
///
/// The percentage prefix differs by generator (Makefiles print `[100%]`, Ninja `[2/2]`), so only
/// the marker and the name that follows it are matched. A Ninja or Xcode build that finds a target
/// up to date prints no such line at all, which is why a reported target is not the only source.
pub const BUILT_TARGET_MARKER: &str = "Built target ";

/// Every target this build printed, in the order it first printed it.
///
/// CMake names a target whether it rebuilt it or found it up to date, and it names libraries and
/// utility targets too, so this is a list of *candidates*, not executables. A target can appear
/// more than once across a build, so repeats are dropped here rather than by the resolver.
pub fn reported_targets(output: &str) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    for line in output.lines() {
        let Some((_, tail)) = line.split_once(BUILT_TARGET_MARKER) else {
            continue;
        };
        let name = tail.trim();
        if name.is_empty() || names.iter().any(|seen| seen == name) {
            continue;
        }
        names.push(name.to_string());
    }
    names
}
