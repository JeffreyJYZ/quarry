//! The compilers the toolchain records, one per language.
//!
//! A `compile_commands.json` entry starts with the compiler that ran; CMake's compile group records
//! only the flags. `toolchains-v1` is where the compiler path is written down, so a synthesized
//! entry names the same driver the real command line does instead of a guess.

#![allow(unused_imports)]

pub use std::collections::HashMap;
pub use std::path::{Path, PathBuf};

pub use serde_json::Value;

use super::*;

/// The C driver named when the reply carries no C toolchain.
pub const DEFAULT_C_COMPILER: &str = "cc";

/// The C++ driver named when the reply carries no C++ toolchain.
pub const DEFAULT_CXX_COMPILER: &str = "c++";

/// The compilers a reply records, keyed by CMake's language name (`C`, `CXX`, `ASM`, …).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Compilers {
    paths: HashMap<String, PathBuf>,
}

impl Compilers {
    /// Read `toolchains-v1`; a reply without it is not an error, because the drivers default.
    pub fn load(build_root: &Path) -> Self {
        match read_object(build_root, TOOLCHAINS_KIND) {
            Ok(value) => Self::parse(&value),
            Err(_) => Self::default(),
        }
    }

    /// Parse a toolchains object into one path per language.
    pub fn parse(value: &Value) -> Self {
        let mut paths = HashMap::new();
        for toolchain in value["toolchains"]
            .as_array()
            .map(Vec::as_slice)
            .unwrap_or_default()
        {
            let (Some(language), Some(path)) = (
                toolchain["language"].as_str(),
                toolchain["compiler"]["path"].as_str(),
            ) else {
                continue;
            };
            paths.insert(language.to_string(), PathBuf::from(path));
        }
        Self { paths }
    }

    /// The driver for a compile group's language.
    ///
    /// A language with no recorded toolchain falls back to the conventional driver rather than to
    /// an empty first argument, which would make an entry no consumer can read.
    pub fn driver(&self, language: Option<&str>) -> String {
        if let Some(path) = language.and_then(|language| self.paths.get(language)) {
            return path.display().to_string();
        }
        match language {
            Some("C") => DEFAULT_C_COMPILER.to_string(),
            Some("CXX") | Some("OBJCXX") => DEFAULT_CXX_COMPILER.to_string(),
            Some("OBJC") => DEFAULT_C_COMPILER.to_string(),
            _ => DEFAULT_C_COMPILER.to_string(),
        }
    }

    /// The flag spelling the driver for `language` takes.
    pub fn style(&self, language: Option<&str>) -> DriverStyle {
        driver_style(&self.driver(language))
    }

    /// Whether the reply named a compiler for `language`.
    #[allow(dead_code)] // read by the test that proves the driver fallback is never the empty string
    pub fn has(&self, language: &str) -> bool {
        self.paths.contains_key(language)
    }
}

/// The two flag spellings a compiler family takes in a synthesised command line.
///
/// A `compile_commands.json` written by CMake uses the generator's own spelling; a synthesised one
/// has to choose, because CMake's compile groups carry paths and defines rather than a command.
/// MSVC's `cl.exe` is the only family here that spells its flags with `/`, and an entry that gave it
/// `-I` described a compiler this tree was not built with.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DriverStyle {
    /// clang, gcc and every driver of that shape: `-I`, `-isystem`, `-D`, `-c`.
    Gnu,
    /// MSVC's `cl.exe` and the clang that speaks its dialect: `/I`, `/external:I`, `/D`, `/c`.
    Msvc,
}

/// The spelling a driver's command line takes.
pub fn driver_style(driver: &str) -> DriverStyle {
    let name = Path::new(driver)
        .file_name()
        .map(|name| name.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    let stem = name.strip_suffix(".exe").unwrap_or(name.as_str());
    if stem == "cl" || stem == "clang-cl" {
        DriverStyle::Msvc
    } else {
        DriverStyle::Gnu
    }
}
