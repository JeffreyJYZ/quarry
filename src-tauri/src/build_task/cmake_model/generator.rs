//! What a generator takes at build time, and which cache values it honours.
//!
//! A multi-config generator (Xcode, Visual Studio, Ninja Multi-Config) takes its configuration on
//! the build command line and writes no `compile_commands.json`; a single-config one needs its
//! build type at configure time and writes the database itself. The plan and the database reader
//! must answer the same way, so the answer lives in one place.

#![allow(unused_imports)]

use super::*;

/// Xcode and Visual Studio are multi-config: they take `--config` at build time.
pub fn is_multi_config(generator: Option<&str>) -> bool {
    generator.is_some_and(|name| {
        name.starts_with("Xcode")
            || name.starts_with("Visual Studio")
            || name == "Ninja Multi-Config"
    })
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
