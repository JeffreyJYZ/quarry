//! The codemodel as quarry reads it: configurations, targets, artifacts and compile groups.
//!
//! The reply file only names each target's object (`jsonFile`); the target's own file carries the
//! type, artifacts, sources and compile groups. Both are read together here, so a caller never sees
//! a target whose details it would have to fetch itself.
//!
//! Paths are resolved at load time. The codemodel records its source and build roots, a target
//! records its directories relative to those, and its sources are relative to its source directory
//! while its artifacts are relative to the top-level build directory — resolving them here is what
//! makes a multi-config and an `add_subdirectory` project read identically.

#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub use serde_json::Value;

use super::parse::{parse_configuration, path_field};
use super::*;

/// The project model one configure wrote: its roots and one entry per configuration.
#[derive(Clone, Debug, PartialEq)]
pub struct Codemodel {
    pub source_root: PathBuf,
    pub build_root: PathBuf,
    pub configurations: Vec<Configuration>,
}

/// One configuration the generator supports, with every target as that configuration defines it.
#[derive(Clone, Debug, PartialEq)]
pub struct Configuration {
    pub name: String,
    pub targets: Vec<Target>,
}

/// One target: what it is, where its files live, and the flags each source compiles with.
#[derive(Clone, Debug, PartialEq)]
pub struct Target {
    pub name: String,
    pub kind: TargetKind,
    pub configuration: String,
    pub build_dir: PathBuf,
    pub artifacts: Vec<PathBuf>,
    pub groups: Vec<CompileGroup>,
}

/// The target type CMake records, reduced to the distinction a reader acts on.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TargetKind {
    Executable,
    Library(String),
    Other(String),
}

/// The flags one group of sources compiles with, and the sources it covers.
#[derive(Clone, Debug, PartialEq)]
pub struct CompileGroup {
    pub language: Option<String>,
    pub includes: Vec<IncludePath>,
    pub defines: Vec<String>,
    pub fragments: Vec<String>,
    pub sources: Vec<PathBuf>,
}

/// One include directory and whether CMake marked it as a system directory.
#[derive(Clone, Debug, PartialEq)]
pub struct IncludePath {
    pub path: PathBuf,
    pub system: bool,
}

impl TargetKind {
    /// Read CMake's type string; every library flavour stays a library for a launch decision.
    pub fn parse(value: &str) -> Self {
        if value == EXECUTABLE_TYPE {
            return Self::Executable;
        }
        if value.ends_with("_LIBRARY") || value == "INTERFACE_LIBRARY" {
            return Self::Library(value.to_string());
        }
        Self::Other(value.to_string())
    }

    pub fn is_executable(&self) -> bool {
        matches!(self, Self::Executable)
    }
}

impl Codemodel {
    /// The configuration named `name`, when the generator reports it.
    pub fn configuration(&self, name: &str) -> Option<&Configuration> {
        self.configurations
            .iter()
            .find(|configuration| configuration.name == name)
    }

    /// The configuration a launch should describe: `preferred` when present, else the first.
    pub fn active(&self, preferred: &str) -> Option<&Configuration> {
        self.configuration(preferred)
            .or_else(|| self.configurations.first())
    }
}

/// Read the reply in `build_root` into a model, or return why it cannot be read.
///
/// A reply that names a file it does not hold is an error rather than a partial model: a configure
/// that was interrupted leaves exactly that, and reading half of it would describe half a project.
pub fn read_codemodel(build_root: &Path) -> Result<Codemodel, String> {
    let value = read_object(build_root, CODEMODEL_KIND)?;
    parse_codemodel(&value, build_root)
}

/// Parse a codemodel object, reading each target's own file from the reply in `reply_root`.
///
/// The recorded `paths` describe where the project's files live; the reply itself stays where the
/// configure wrote it, which is `reply_root`. A test fixture keeps both apart on purpose.
pub fn parse_codemodel(value: &Value, reply_root: &Path) -> Result<Codemodel, String> {
    let fallback = reply_root.to_path_buf();
    let source_root = path_field(&value["paths"]["source"]).unwrap_or_else(|| fallback.clone());
    let resolved_build = path_field(&value["paths"]["build"]).unwrap_or(fallback);
    let configurations = value["configurations"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();

    let mut parsed = Vec::with_capacity(configurations.len());
    for configuration in configurations {
        parsed.push(parse_configuration(
            configuration,
            &resolved_build,
            &source_root,
            reply_root,
        )?);
    }
    if parsed.is_empty() {
        return Err("the CMake codemodel names no configuration".to_string());
    }
    Ok(Codemodel {
        source_root,
        build_root: resolved_build,
        configurations: parsed,
    })
}
