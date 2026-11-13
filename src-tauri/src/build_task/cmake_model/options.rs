//! The CMake choices the user can override, and where they come from.
//!
//! Three values and no more: which configure preset to use, where the build tree lives, and which
//! toolchain file to configure with. Each is empty by default, and an empty value means "let the
//! project decide", so a project with no `.quarry/settings.json` is unaffected.

#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

use super::*;

/// The CMake section of a project's `.quarry/settings.json`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct CmakeOptions {
    /// Configure preset from `CMakePresets.json`; empty uses the project's only visible preset.
    pub preset: String,
    /// Build directory, absolute or relative to the project root; empty means detection decides.
    pub build_dir: String,
    /// Toolchain file; empty means the preset's own `CMAKE_TOOLCHAIN_FILE`, else none.
    pub toolchain_file: String,
}

impl CmakeOptions {
    /// The override a project's saved settings hold; every value is trimmed, so " " is empty.
    pub fn from_project(settings: &crate::settings::ProjectSettings) -> Self {
        Self {
            preset: settings.cmake_preset.trim().to_string(),
            build_dir: settings.cmake_build_dir.trim().to_string(),
            toolchain_file: settings.cmake_toolchain_file.trim().to_string(),
        }
    }

    /// The override this project's `.quarry/settings.json` holds, or the defaults.
    ///
    /// Detection runs when a project is opened and again for every build, so the file is read here
    /// rather than threaded through the IPC layer: a build must use what is on disk now.
    pub fn for_root(root: &Path) -> Self {
        Self::from_project(&crate::settings::read_project_settings(
            root.display().to_string(),
        ))
    }

    /// The build directory when the user named one; a relative value resolves against the project.
    pub fn build_dir_path(&self, root: &Path) -> Option<PathBuf> {
        let value = self.build_dir.trim();
        if value.is_empty() {
            return None;
        }
        Some(absolute(root, value))
    }

    /// The toolchain file override, when the user named one.
    pub fn toolchain(&self) -> Option<&str> {
        let value = self.toolchain_file.trim();
        (!value.is_empty()).then_some(value)
    }
}
