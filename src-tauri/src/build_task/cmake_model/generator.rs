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
    generator_standing(build_root, preset_generator) == GeneratorStanding::MultiConfig
}

/// What the project's own files say about the generator a configure will use.
///
/// Two answers are facts read off the disk; the third is the honest admission that a tree with no
/// preset, no `CMakeCache.txt` and no reply has not said anything yet, and the configure is about to
/// find out by letting CMake pick. A plan that treated that silence as "single-config" was the
/// defect: it passed `-DCMAKE_BUILD_TYPE` to whatever CMake defaulted to, and a multi-config default
/// recorded a value its own generator ignores.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GeneratorStanding {
    /// One configuration per tree: the build type has to be given at configure time.
    SingleConfig,
    /// Every configuration in one tree: `--config` carries it at build time.
    MultiConfig,
    /// Nothing on disk names one, so the answer is CMake's own default.
    Unknown,
}

/// The generator question, answered without guessing: the preset, the cache, the reply, or unknown.
pub fn generator_standing(build_root: &Path, preset_generator: Option<&str>) -> GeneratorStanding {
    if let Some(name) = preset_generator {
        return standing_of(name);
    }
    if let Some(name) = generator_at(build_root) {
        return standing_of(&name);
    }
    // A helper's preset can leave the cache silent on the generator while its reply states both the
    // name and whether every configuration lives in one tree; the reply is a record, not a guess.
    if reply_multi_config(build_root) {
        return GeneratorStanding::MultiConfig;
    }
    match reply_generator(build_root) {
        Some(name) => standing_of(&name),
        None => GeneratorStanding::Unknown,
    }
}

/// The generator a configure will use, as the preset first names it, then the tree's own records.
///
/// `None` is the answer for a tree that has not said anything yet: reported as such, rather than as
/// a generator CMake might not pick.
pub fn generator_name(build_root: &Path, preset_generator: Option<&str>) -> Option<String> {
    if let Some(name) = preset_generator {
        return Some(name.to_string());
    }
    generator_at(build_root).or_else(|| reply_generator(build_root))
}

fn standing_of(name: &str) -> GeneratorStanding {
    if is_multi_config(Some(name)) {
        GeneratorStanding::MultiConfig
    } else {
        GeneratorStanding::SingleConfig
    }
}

fn reply_generator(build_root: &Path) -> Option<String> {
    read_reply(build_root)
        .ok()
        .and_then(|reply| reply.generator)
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
