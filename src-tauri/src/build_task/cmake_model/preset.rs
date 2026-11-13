//! `CMakePresets.json` and `CMakeUserPresets.json`, parsed and merged.
//!
//! Only what decides a build command is read: the configure preset's name, inheritance, binary
//! directory, generator and cache variables, and the build preset's configuration. A preset file
//! CMake itself would reject is reported instead of guessed at — the caller falls back to the
//! explicit argv rather than configuring the wrong tree.
//!
//! The user's file wins: a preset of the same name in `CMakeUserPresets.json` replaces the
//! project's entry, which is how a second toolchain or a different binary directory is selected
//! without editing a file in the project.

#![allow(unused_imports)]

pub use std::collections::BTreeMap;
pub use std::fs;
pub use std::path::Path;

use super::*;

pub const PRESETS_FILE: &str = "CMakePresets.json";

pub const USER_PRESETS_FILE: &str = "CMakeUserPresets.json";

/// A preset is named and inherits; both files' entry lists merge by that name.
pub trait NamedPreset {
    fn name(&self) -> &str;
    fn inherits(&self) -> &[String];
    fn hidden(&self) -> bool;
}

/// One configure preset, exactly as the file spells it.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ConfigurePreset {
    pub name: String,
    pub hidden: bool,
    pub inherits: Vec<String>,
    pub binary_dir: Option<String>,
    pub generator: Option<String>,
    pub cache: BTreeMap<String, String>,
}

/// One build preset; only the configuration and the configure preset it belongs to matter here.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BuildPreset {
    pub name: String,
    pub hidden: bool,
    pub inherits: Vec<String>,
    pub configure_preset: Option<String>,
    pub configuration: Option<String>,
}

impl NamedPreset for ConfigurePreset {
    fn name(&self) -> &str {
        &self.name
    }
    fn inherits(&self) -> &[String] {
        &self.inherits
    }
    fn hidden(&self) -> bool {
        self.hidden
    }
}

impl NamedPreset for BuildPreset {
    fn name(&self) -> &str {
        &self.name
    }
    fn inherits(&self) -> &[String] {
        &self.inherits
    }
    fn hidden(&self) -> bool {
        self.hidden
    }
}

/// Both preset kinds, merged project file first then user file.
#[derive(Clone, Debug, Default)]
pub struct Presets {
    pub configure: Vec<ConfigurePreset>,
    pub build: Vec<BuildPreset>,
    /// Files that exist but hold no preset object; named so the build can say it ignored them.
    pub invalid: Vec<String>,
}

/// Read both preset files below `root`; a missing file is simply no presets.
pub fn load(root: &Path) -> Presets {
    let mut merged = Presets::default();
    for file in [PRESETS_FILE, USER_PRESETS_FILE] {
        let Ok(text) = fs::read_to_string(root.join(file)) else {
            continue;
        };
        match super::preset_parse::parse(&text) {
            Some(next) => merged.extend(next),
            None => merged.invalid.push(file.to_string()),
        }
    }
    merged
}

impl Presets {
    fn extend(&mut self, next: Presets) {
        for preset in next.configure {
            replace_or_push(&mut self.configure, preset);
        }
        for preset in next.build {
            replace_or_push(&mut self.build, preset);
        }
    }
}

/// The user's entry replaces the project's when the names match, else it is appended.
fn replace_or_push<T: NamedPreset>(items: &mut Vec<T>, preset: T) {
    match items.iter_mut().find(|item| item.name() == preset.name()) {
        Some(slot) => *slot = preset,
        None => items.push(preset),
    }
}
