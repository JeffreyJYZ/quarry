//! The build profile a clangd session analyses with.
//!
//! CLion analyses the configuration the user is building, so a project built as `RelWithDebInfo`
//! is read with `-O2 -g` and not with the Debug flags of some other tree. The session therefore
//! asks the plan for the profile the build was given, and decides from the tree's own cache whether
//! that is the profile it was configured for.
//!
//! A multi-config generator (Xcode, Visual Studio, Ninja Multi-Config) takes its configuration at
//! build time and leaves `CMAKE_BUILD_TYPE` empty, so it is never "configured for" a profile and is
//! never reconfigured for one — asking would rewrite the cache on every start and say the same
//! thing forever.

#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

pub use crate::build_task::{
    BUILD_TYPE_VARIABLE, BuildProfile, CMAKE_CACHE, CmakePlan, ConfigureIntent, cache_value,
    is_multi_config,
};

use super::*;

/// CMake's cache entry naming the generator a tree was configured with.
pub const GENERATOR_VARIABLE: &str = "CMAKE_GENERATOR";

/// The plan's build type flag, which a tree configured for another profile must be given.
pub const BUILD_TYPE_FLAG: &str = "-DCMAKE_BUILD_TYPE=";

/// The build type this session's configure must carry, or `None` when the tree takes none.
///
/// The plan already drops the type for a preset that names its own; this also drops it for a tree
/// whose cache says the generator is multi-config, where CMake ignores the variable entirely.
pub fn wanted_build_type(plan: &CmakePlan) -> Option<String> {
    let generator = cache_value(&plan.build_root, GENERATOR_VARIABLE);
    if is_multi_config(generator.as_deref()) {
        return None;
    }
    plan.intent.build_type.clone()
}

/// Whether the tree is configured for another profile than the one being built.
pub fn build_type_changed(plan: &CmakePlan) -> bool {
    let Some(wanted) = wanted_build_type(plan) else {
        return false;
    };
    let configured = cache_value(&plan.build_root, BUILD_TYPE_VARIABLE).unwrap_or_default();
    !configured.trim().eq_ignore_ascii_case(wanted.trim())
}

/// What the hand-off asks a configure to carry: the plan's toolchain and its build profile.
///
/// The build type is part of the comparison, not only the command line: a tree configured for
/// another profile is genuinely stale, and saying so is what makes the one reconfigure visible
/// instead of silent. A multi-config tree is never asked for one (see [`wanted_build_type`]).
pub fn handoff_intent(plan: &CmakePlan) -> ConfigureIntent {
    ConfigureIntent {
        toolchain: plan.intent.toolchain.clone(),
        build_type: wanted_build_type(plan),
    }
}

/// The plan's configure, keeping the build type only when the tree must change profile.
///
/// Reconfiguring a tree that is already configured for this profile must not touch its build type;
/// a tree configured for another one must be given the plan's. A fresh tree has nothing to keep,
/// so it gets the plan's configure whole.
pub fn configure_argv(plan: &CmakePlan) -> Vec<String> {
    if !plan.build_root.join(CMAKE_CACHE).is_file() || build_type_changed(plan) {
        return plan.configure.clone();
    }
    plan.configure
        .iter()
        .filter(|arg| !arg.starts_with(BUILD_TYPE_FLAG))
        .cloned()
        .collect()
}
