#![allow(unused_imports)]

pub(crate) use crate::types::{LaunchConfig, LaunchFile, LaunchPreset, ProjectInfo, ProjectKind};
pub use std::path::{Path, PathBuf};

use super::*;

/// The gtest binary a project configures, and the preset that named it.
#[derive(Debug)]
pub struct GtestProgram {
    pub path: PathBuf,
    /// Working directory the preset names, or the project root.
    pub cwd: PathBuf,
    pub preset: String,
}

/// Whether discovery should ask this project for gtest cases at all.
///
/// A C/C++ project always has one program worth asking. A Cargo project only does when a preset is
/// named after a test, so a Rust app's own `launch.json` is never started with an unknown flag.
pub fn should_probe(info: &ProjectInfo) -> bool {
    match info.kind {
        ProjectKind::Cmake | ProjectKind::CompileCommands => true,
        ProjectKind::Cargo => load_presets(info)
            .map(|presets| presets.iter().any(is_test_preset))
            .unwrap_or(false),
        ProjectKind::Unknown => false,
    }
}

/// The program tests come from, an error naming the gap when the project configures none.
pub fn program_for(info: &ProjectInfo) -> Result<GtestProgram, String> {
    let presets = load_presets(info)?;
    let candidates: Vec<&LaunchPreset> = presets
        .iter()
        .filter(|preset| {
            preset
                .program
                .as_deref()
                .is_some_and(|program| !program.trim().is_empty())
        })
        .collect();
    if candidates.is_empty() {
        return Err(no_program_message());
    }
    let picked = candidates
        .iter()
        .find(|preset| is_test_preset(preset))
        .copied()
        .unwrap_or(candidates[0]);
    let program = picked.program.as_deref().map(str::trim).unwrap_or_default();
    Ok(GtestProgram {
        path: program_path(info, program)?,
        cwd: working_dir(info, picked),
        preset: picked.name.clone(),
    })
}

/// The sentence a project with no configured program gets, instead of an empty list.
pub fn no_program_message() -> String {
    "no run configuration names a program: add one to .quarry/launch.json (the Run tab) and the \
     GoogleTest list comes from it"
        .to_string()
}

/// Presets from `.quarry/launch.json`; a missing file is a project with no presets.
fn load_presets(info: &ProjectInfo) -> Result<Vec<LaunchPreset>, String> {
    run_config::load(&info.root).map(|(_root, file)| file.configurations)
}

/// A preset called after tests, or one whose program is, is the gtest binary to ask first.
fn is_test_preset(preset: &LaunchPreset) -> bool {
    let names_tests = |text: &str| text.to_lowercase().contains("test");
    if names_tests(&preset.name) {
        return true;
    }
    preset
        .program
        .as_deref()
        .and_then(|program| Path::new(program.trim()).file_stem())
        .map(|stem| names_tests(&stem.to_string_lossy()))
        .unwrap_or(false)
}

/// Resolves the configured program: relative paths stay inside the project root, an absolute path
/// is the project's explicit choice, and a missing file is named rather than run.
fn program_path(info: &ProjectInfo, raw: &str) -> Result<PathBuf, String> {
    let root = Path::new(&info.root);
    let candidate = Path::new(raw);
    if candidate.is_absolute() {
        return existing(candidate);
    }
    let joined = root.join(candidate);
    let path = crate::files::ensure_within(root, &joined).map_err(|_| {
        format!(
            "run configuration program \"{raw}\" resolves outside the project root {}",
            root.display()
        )
    })?;
    existing(&path)
}

fn existing(path: &Path) -> Result<PathBuf, String> {
    if path.is_file() {
        return Ok(path.to_path_buf());
    }
    Err(format!(
        "run configuration program {} does not exist: build the project first, or correct the preset",
        path.display()
    ))
}

/// The preset's working directory, resolved against the root, or the root itself.
fn working_dir(info: &ProjectInfo, preset: &LaunchPreset) -> PathBuf {
    let root = Path::new(&info.root);
    match preset.cwd.as_deref().map(str::trim) {
        Some(cwd) if !cwd.is_empty() => {
            let candidate = Path::new(cwd);
            if candidate.is_absolute() {
                candidate.to_path_buf()
            } else {
                root.join(candidate)
            }
        }
        _ => root.to_path_buf(),
    }
}
