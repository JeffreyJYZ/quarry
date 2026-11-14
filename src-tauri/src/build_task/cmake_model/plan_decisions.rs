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
    build_root: &Path,
    notes: &mut Vec<String>,
) -> Option<String> {
    if preset.cache.contains_key("CMAKE_BUILD_TYPE") {
        return None;
    }
    if tree_multi_config(build_root, preset.generator.as_deref()) {
        // A multi-config generator takes its configuration at build time; nothing to force here.
        return None;
    }
    notes.push(format!(
        "preset {} sets no CMAKE_BUILD_TYPE, so -DCMAKE_BUILD_TYPE={configuration} keeps debug info",
        preset.name
    ));
    Some(configuration.to_string())
}

/// The explicit recipe a project with no preset runs, and why each flag is there.
///
/// The build type is the one decision a tree with no preset cannot make from its files: a
/// single-config generator needs it at configure time, or it compiles without `-g`, and a
/// multi-config one ignores it. So an unconfigured tree keeps the type — losing debug info on every
/// single-config project to spare a generator that only appears on some machines is the worse trade
/// — and the note says the generator is CMake's to choose. Measured with cmake 4.5 and
/// `Ninja Multi-Config`, that guess is recorded in the cache as `CMAKE_BUILD_TYPE:UNINITIALIZED=`;
/// it stays there, because the tree may be the user's own, and the next plan reads its cache and
/// passes no build type from then on.
pub struct RecipeConfigure {
    pub configure: Vec<String>,
    /// The build type this configure passes, or `None` when the generator takes none.
    pub build_type: Option<String>,
}

/// The explicit `-S … -B …` configure, for a tree whose project declares no usable preset.
pub fn recipe_configure(
    source_root: &str,
    dir: &str,
    build_root: &Path,
    profile: BuildProfile,
    notes: &mut Vec<String>,
) -> RecipeConfigure {
    let standing = generator_standing(build_root, None);
    let configuration = cmake_config(profile);
    let typed = standing != GeneratorStanding::MultiConfig;
    if standing == GeneratorStanding::Unknown {
        notes.push(format!(
            "no preset, cache or reply names a generator, so cmake picks one; \
             -DCMAKE_BUILD_TYPE={configuration} keeps debug info on a single-config one, \
             and a multi-config one ignores it and builds --config {configuration}"
        ));
    }
    let build_type = typed.then(|| configuration.to_string());
    let configure = if typed {
        cmake_configure_argv(source_root, dir, profile)
    } else {
        cmake_configure_argv_with(source_root, dir, None)
    };
    RecipeConfigure {
        configure,
        build_type,
    }
}

/// Whether a compiler database will be written, honouring a value the project set itself.
pub fn compile_database(
    preset: &ResolvedConfigure,
    build_root: &Path,
    notes: &mut Vec<String>,
) -> bool {
    let generator = preset.generator.as_deref();
    let writes = !tree_multi_config(build_root, generator);
    match preset.cache.get("CMAKE_EXPORT_COMPILE_COMMANDS") {
        Some(value) if is_cache_on(value) => writes,
        Some(value) => {
            notes.push(format!(
                "preset sets CMAKE_EXPORT_COMPILE_COMMANDS={value}, so no compiler database is written"
            ));
            false
        }
        None => writes,
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
