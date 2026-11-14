#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{LaunchConfig, ProjectInfo, ProjectKind};
pub use regex::Regex;
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_multi_config {
    use super::*;

    /// A multi-config generator writes one directory per configuration, and the search used to know
    /// only `Debug` and `Release`: a `RelWithDebInfo` build's binary was never a candidate, so Run
    /// named the plain path no generator wrote.
    #[test]
    pub fn a_relwithdebinfo_build_is_a_candidate() {
        let root = Path::new("/work/demo");

        let paths = paths_for_name(root, "app", ProjectKind::Cmake);

        assert!(paths.contains(&PathBuf::from("/work/demo/build/RelWithDebInfo/app")));
        assert!(paths.contains(&PathBuf::from("/work/demo/build/MinSizeRel/app")));
    }

    /// One list, not two: every configuration the build task searches is one this resolution
    /// searches, or the two disagree the way they did before.
    #[test]
    pub fn the_configurations_are_the_build_tasks_own() {
        assert_eq!(
            MULTI_CONFIG_DIRS.to_vec(),
            crate::build_task::MULTI_CONFIG_DIRS.to_vec()
        );
        assert_eq!(MULTI_CONFIG_DIRS.len(), 4);
    }
}
