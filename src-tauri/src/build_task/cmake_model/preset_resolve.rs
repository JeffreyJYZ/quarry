//! Inheritance: what a preset actually carries once its parents are applied.
//!
//! A child overrides its parents field by field, cache variables key by key, and `${sourceDir}`,
//! `${sourceParentDir}` and `${presetName}` expand the way CMake expands them. Anything else
//! (`$env{}`, generator expressions) is left verbatim: guessing would configure a directory that
//! does not exist rather than failing where CMake can explain itself.

#![allow(unused_imports)]

pub use std::collections::BTreeMap;
pub use std::path::{Path, PathBuf};

use super::*;

/// Longest inheritance chain walked before it is called a loop.
pub const MAX_INHERIT_DEPTH: usize = 32;

/// A configure preset with every parent applied.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ResolvedConfigure {
    pub name: String,
    /// Absolute binary directory; `None` means CMake's default, which is the source directory.
    pub binary_dir: Option<PathBuf>,
    pub generator: Option<String>,
    pub cache: BTreeMap<String, String>,
}

/// A build preset with its inherited configuration.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ResolvedBuild {
    pub name: String,
    pub configuration: Option<String>,
}

/// Resolve one configure preset, expanding what the build command needs.
pub fn resolve_configure(
    presets: &Presets,
    name: &str,
    root: &Path,
) -> Result<ResolvedConfigure, String> {
    let chain = chain(&presets.configure, name, "configure")?;
    let mut resolved = ResolvedConfigure {
        name: name.to_string(),
        ..ResolvedConfigure::default()
    };
    for preset in chain {
        if let Some(binary) = preset.binary_dir {
            resolved.binary_dir = Some(absolute(root, &expand(&binary, root, name)));
        }
        if let Some(generator) = preset.generator {
            resolved.generator = Some(generator);
        }
        for (key, value) in preset.cache {
            resolved.cache.insert(key, value);
        }
    }
    Ok(resolved)
}

/// Resolve one build preset's configuration, inheriting it when the preset does not set it.
pub fn resolve_build(presets: &Presets, name: &str) -> Option<ResolvedBuild> {
    let chain = chain(&presets.build, name, "build").ok()?;
    let mut configuration = None;
    for preset in chain {
        if preset.configuration.is_some() {
            configuration = preset.configuration;
        }
    }
    Some(ResolvedBuild {
        name: name.to_string(),
        configuration,
    })
}

/// The directory a configure preset builds into.
///
/// CMake's own default when a preset names no `binaryDir` is the source directory, so an
/// in-source preset is not a missing answer.
pub fn preset_binary(resolved: &ResolvedConfigure, root: &Path) -> PathBuf {
    resolved
        .binary_dir
        .clone()
        .unwrap_or_else(|| root.to_path_buf())
}

/// Parents first, the named preset last, so a later entry overrides an earlier one.
fn chain<T: NamedPreset + Clone>(all: &[T], name: &str, kind: &str) -> Result<Vec<T>, String> {
    let mut chain = Vec::new();
    collect(all, name, kind, &mut Vec::new(), &mut chain)?;
    Ok(chain)
}

fn collect<T: NamedPreset + Clone>(
    all: &[T],
    name: &str,
    kind: &str,
    stack: &mut Vec<String>,
    chain: &mut Vec<T>,
) -> Result<(), String> {
    if stack.iter().any(|seen| seen == name) {
        return Err(format!(
            "{kind} preset {name:?} inherits itself, so the chain never ends"
        ));
    }
    if stack.len() >= MAX_INHERIT_DEPTH {
        return Err(format!(
            "{kind} preset inheritance is deeper than {MAX_INHERIT_DEPTH} levels at {name:?}"
        ));
    }
    let preset = all
        .iter()
        .find(|preset| preset.name() == name)
        .ok_or_else(|| {
            format!("{kind} preset {name:?} is inherited but not defined in any preset file")
        })?;
    stack.push(name.to_string());
    for parent in preset.inherits() {
        collect(all, parent, kind, stack, chain)?;
    }
    stack.pop();
    chain.push(preset.clone());
    Ok(())
}

/// Expand the three preset variables that decide where a build lands.
pub fn expand(value: &str, root: &Path, preset: &str) -> String {
    let source = root.display().to_string();
    let parent = root
        .parent()
        .map(|dir| dir.display().to_string())
        .unwrap_or_default();
    value
        .replace("${sourceDir}", &source)
        .replace("${sourceParentDir}", &parent)
        .replace("${presetName}", preset)
}
