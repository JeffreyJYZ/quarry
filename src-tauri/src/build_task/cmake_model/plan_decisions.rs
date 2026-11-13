//! The answers a preset leaves to the plan: which configuration, which build type, a database.
//!
//! [`super::cmake_plan_target`] decides the shape; these functions read the preset and the profile
//! once each and say what the argv must carry, so the reasoning lives beside the plan without
//! making one file hold both.

#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

pub use crate::build_task::{BuildProfile, CMAKE_PROGRAM, cmake_config};

use super::*;

/// The toolchain file a preset configures with, expanded against the tree it describes.
pub fn preset_toolchain(preset: &ResolvedConfigure, root: &Path) -> Option<PathBuf> {
    let value = preset.cache.get(TOOLCHAIN_VARIABLE)?;
    Some(absolute(
        root,
        &super::preset_resolve::expand(value, root, &preset.name),
    ))
}

/// The configuration this build uses: the build preset's, then the configure preset's, then the profile.
pub fn configuration(
    presets: &Presets,
    preset: &ResolvedConfigure,
    profile: BuildProfile,
) -> String {
    let named = build_preset(presets, &preset.name)
        .and_then(|named| super::preset_resolve::resolve_build(presets, &named.name));
    named
        .and_then(|named| named.configuration)
        .or_else(|| preset.cache.get("CMAKE_BUILD_TYPE").cloned())
        .unwrap_or_else(|| cmake_config(profile).to_string())
}

/// The build type to pass, or `None` when the preset's own value stands.
pub fn build_type(
    preset: &ResolvedConfigure,
    configuration: &str,
    notes: &mut Vec<String>,
) -> Option<String> {
    if preset.cache.contains_key("CMAKE_BUILD_TYPE") {
        return None;
    }
    if is_multi_config(preset.generator.as_deref()) {
        // A multi-config generator takes its configuration at build time; nothing to force here.
        return None;
    }
    notes.push(format!(
        "preset {} sets no CMAKE_BUILD_TYPE, so -DCMAKE_BUILD_TYPE={configuration} keeps debug info",
        preset.name
    ));
    Some(configuration.to_string())
}

/// Whether a compiler database will be written, honouring a value the project set itself.
pub fn compile_database(preset: &ResolvedConfigure, notes: &mut Vec<String>) -> bool {
    match preset.cache.get("CMAKE_EXPORT_COMPILE_COMMANDS") {
        Some(value) if is_cache_on(value) => writes_compile_database(preset.generator.as_deref()),
        Some(value) => {
            notes.push(format!(
                "preset sets CMAKE_EXPORT_COMPILE_COMMANDS={value}, so no compiler database is written"
            ));
            false
        }
        None => writes_compile_database(preset.generator.as_deref()),
    }
}

/// The notes as one line, or `None` when there is nothing to report.
pub fn join(notes: Vec<String>) -> Option<String> {
    if notes.is_empty() {
        None
    } else {
        Some(notes.join("; "))
    }
}
