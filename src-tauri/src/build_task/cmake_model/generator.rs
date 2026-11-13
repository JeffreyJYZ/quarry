//! What a generator takes at build time, and which cache values it honours.
//!
//! A multi-config generator (Xcode, Visual Studio, Ninja Multi-Config) takes its configuration on
//! the build command line and writes no `compile_commands.json`; a single-config one needs its
//! build type at configure time and writes the database itself. The plan and the database reader
//! must answer the same way, so the answer lives in one place.

#![allow(unused_imports)]

use super::*;

/// The cache entry naming the generator a tree was configured with.
pub const GENERATOR_VARIABLE: &str = "CMAKE_GENERATOR";

/// Xcode and Visual Studio are multi-config: they take `--config` at build time.
pub fn is_multi_config(generator: Option<&str>) -> bool {
    generator.is_some_and(|name| {
        name.starts_with("Xcode")
            || name.starts_with("Visual Studio")
            || name == "Ninja Multi-Config"
    })
}

/// The generator a configured tree records, so a plan can honour what the tree already is.
///
/// A project with no preset states its generator only in its cache, and a configure that skips it
/// would ask a multi-config tree for a `CMAKE_BUILD_TYPE` it never uses.
pub fn generator_at(build_root: &Path) -> Option<String> {
    cache_value(build_root, GENERATOR_VARIABLE)
}

/// Whether the tree's own last reply says its generator is multi-config.
///
/// A tree configured by a helper whose preset names no generator still records the answer here —
/// the index states `cmake.generator.multiConfig` — so a preset silent on the generator no longer
/// makes the plan force a `CMAKE_BUILD_TYPE` the generator ignores.
pub fn reply_multi_config(build_root: &Path) -> bool {
    read_reply(build_root).is_ok_and(|reply| reply.multi_config)
}

/// Whether this configure targets a multi-config generator, as the preset, the cache or the reply
/// states it. A preset that names a generator is authoritative; one that is silent leaves the
/// answer to the tree it describes.
pub fn tree_multi_config(build_root: &Path, preset_generator: Option<&str>) -> bool {
    if let Some(name) = preset_generator {
        return is_multi_config(Some(name));
    }
    generator_at(build_root).is_some_and(|name| is_multi_config(Some(&name)))
        || reply_multi_config(build_root)
}

/// Only a single-config Makefiles or Ninja generator implements `CMAKE_EXPORT_COMPILE_COMMANDS`.
///
/// Ninja Multi-Config is multi-config but takes its `--config` at build time; measured on cmake
/// 4.4.5 it writes no database even with the variable on, which is why analysis falls back to the
/// file API for it rather than to a file nobody writes.
pub fn writes_compile_database(generator: Option<&str>) -> bool {
    !is_multi_config(generator)
}

/// Whether a cache value means "on"; only the `ON` spellings CMake accepts do.
pub fn is_cache_on(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_uppercase().as_str(),
        "ON" | "TRUE" | "YES" | "Y" | "1"
    )
}
