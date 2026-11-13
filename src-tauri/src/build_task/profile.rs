//! The four build profiles, and the CMake configuration each one names.
//!
//! CLion offers Debug, Release, RelWithDebInfo and MinSizeRel; quarry only had the first two, so a
//! project that wanted optimised code with debug info could not ask for it. The wire value is the
//! same string `.quarry/settings.json` stores, and the CMake name is the `CMAKE_BUILD_TYPE` value a
//! single-config generator needs (it ignores `--config` at build time) and the `--config` value a
//! multi-config generator needs.

#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

use super::*;

/// Every profile, spelled the way the settings file and the IPC wire spell it.
pub const BUILD_PROFILES: [&str; 4] = ["debug", "release", "relwithdebinfo", "minsizerel"];

/// A build profile: CLion's four, one per CMake configuration.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum BuildProfile {
    #[default]
    Debug,
    Release,
    RelWithDebInfo,
    MinSizeRel,
}

impl BuildProfile {
    /// Parse a wire value; anything else is an error naming every accepted value.
    pub fn from_wire(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "debug" => Ok(Self::Debug),
            "release" => Ok(Self::Release),
            "relwithdebinfo" => Ok(Self::RelWithDebInfo),
            "minsizerel" => Ok(Self::MinSizeRel),
            other => Err(format!(
                "unsupported build profile {other:?}: expected \"debug\", \"release\", \
                 \"relwithdebinfo\" or \"minsizerel\""
            )),
        }
    }

    /// The value the settings file and the IPC wire carry.
    pub fn wire(self) -> &'static str {
        match self {
            Self::Debug => "debug",
            Self::Release => "release",
            Self::RelWithDebInfo => "relwithdebinfo",
            Self::MinSizeRel => "minsizerel",
        }
    }

    /// The configuration name CMake knows this profile by.
    pub fn cmake_config(self) -> &'static str {
        match self {
            Self::Debug => "Debug",
            Self::Release => "Release",
            Self::RelWithDebInfo => "RelWithDebInfo",
            Self::MinSizeRel => "MinSizeRel",
        }
    }

    /// Whether this profile asks for debug info, which is what `RelWithDebInfo` is for.
    pub fn debug_info(self) -> bool {
        !matches!(self, Self::Release | Self::MinSizeRel)
    }

    /// Cargo ships only `debug` and `release`, so every optimised profile builds release.
    pub fn cargo_release(self) -> bool {
        !matches!(self, Self::Debug)
    }
}

/// A boolean profile from older call sites: `false` is Debug, `true` is Release.
impl From<bool> for BuildProfile {
    fn from(release: bool) -> Self {
        if release { Self::Release } else { Self::Debug }
    }
}
