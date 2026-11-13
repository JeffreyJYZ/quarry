//! Which preset a build uses, once both files are merged.

#![allow(unused_imports)]

pub use std::path::Path;

use super::*;

/// The preset a build configures with: the user's name when set, else the only visible one.
///
/// Several visible presets and no choice made is `Ok(None)`: picking one of them would be a guess,
/// and the caller says so in the build's note instead.
pub fn select_configure(presets: &Presets, wanted: &str) -> Result<Option<String>, String> {
    let wanted = wanted.trim();
    if wanted.is_empty() {
        let mut visible = presets.configure.iter().filter(|preset| !preset.hidden());
        return Ok(match (visible.next(), visible.next()) {
            (Some(preset), None) => Some(preset.name.clone()),
            _ => None,
        });
    }
    match presets
        .configure
        .iter()
        .find(|preset| preset.name == wanted)
    {
        Some(preset) if preset.hidden() => Err(format!(
            "configure preset {wanted:?} is hidden, so it cannot be used; pick another one"
        )),
        Some(preset) => Ok(Some(preset.name.clone())),
        None => Err(format!(
            "no configure preset named {wanted:?} in {PRESETS_FILE} or {USER_PRESETS_FILE}"
        )),
    }
}

/// How many presets the project offers a user to pick from.
pub fn visible_configure(presets: &Presets) -> usize {
    presets
        .configure
        .iter()
        .filter(|preset| !preset.hidden())
        .count()
}

/// The visible build preset belonging to `configure`, if the project declares one.
pub fn build_preset<'a>(presets: &'a Presets, configure: &str) -> Option<&'a BuildPreset> {
    let visible: Vec<&BuildPreset> = presets
        .build
        .iter()
        .filter(|preset| !preset.hidden())
        .collect();
    visible
        .iter()
        .find(|preset| preset.configure_preset.as_deref() == Some(configure))
        .or_else(|| visible.iter().find(|preset| preset.name == configure))
        .copied()
}
