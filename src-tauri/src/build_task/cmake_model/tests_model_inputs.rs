#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// The edited-file test the watcher uses to decide a tree needs reconfiguring.
#[cfg(test)]
#[allow(dead_code)]
pub mod tests_cmake_inputs {
    use super::*;

    #[test]
    fn a_manifest_and_a_preset_are_the_inputs_the_watcher_reconfigures_for() {
        assert!(is_model_input(Path::new("/p/CMakeLists.txt")));
        assert!(is_model_input(Path::new("/p/CMakePresets.json")));
        assert!(is_model_input(Path::new("/p/CMakeUserPresets.json")));
        assert!(!is_model_input(Path::new("/p/src/main.cpp")));
        assert!(!is_model_input(Path::new("/p/build/CMakeCache.txt")));
    }
}
