//! What a CMake project actually defines: its targets and the artifact each one writes.
//!
//! A project can define any number of executables and libraries, and neither the project name nor a
//! file name tells them apart — `add_executable(tool …)` in a project called `demo`, two executables
//! in one tree, a target built only in Release. The codemodel names every one of them per
//! configuration with the artifact path its link step writes, which is what run and debug should
//! offer.
//!
//! Libraries are listed too, with their artifacts: a reader without them would have to guess that
//! every target is a program.

#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

pub use serde_json::Value;

use super::*;

/// The configuration a launch describes when the project defines several.
pub const PREFERRED_CONFIGURATION: &str = "Debug";

/// The executables a configured project defines, deduplicated by target name.
///
/// Each entry is the target's name and the artifact to launch: one that exists wins, across
/// configurations, so a project built only in Release still launches; otherwise the path the next
/// build of the active configuration will write, which is what the run form prefills.
pub fn executables(model: &Codemodel, preferred: &str) -> Vec<(String, PathBuf)> {
    let Some(active) = model.active(preferred) else {
        return Vec::new();
    };
    let mut found: Vec<(String, PathBuf)> = Vec::new();
    for target in &active.targets {
        if !target.kind.is_executable() || found.iter().any(|(name, _)| name == &target.name) {
            continue;
        }
        if let Some(path) = target_artifact(model, target) {
            found.push((target.name.clone(), path));
        }
    }
    found
}

/// The libraries the active configuration defines, deduplicated by target name.
#[allow(dead_code)] // read by the tests that prove a library is modelled but is never a run target
pub fn libraries(model: &Codemodel, preferred: &str) -> Vec<(String, PathBuf)> {
    let Some(active) = model.active(preferred) else {
        return Vec::new();
    };
    let mut found: Vec<(String, PathBuf)> = Vec::new();
    for target in &active.targets {
        if !matches!(target.kind, TargetKind::Library(_)) || target.artifacts.is_empty() {
            continue;
        }
        if found.iter().any(|(name, _)| name == &target.name) {
            continue;
        }
        if let Some(path) = target_artifact(model, target) {
            found.push((target.name.clone(), path));
        }
    }
    found
}

/// The artifact a launch or a caller should name for one target.
pub fn target_artifact(model: &Codemodel, target: &Target) -> Option<PathBuf> {
    if let Some(existing) = target.artifacts.iter().find(|path| path.is_file()) {
        return Some(existing.clone());
    }
    for configuration in &model.configurations {
        for other in &configuration.targets {
            if other.name != target.name {
                continue;
            }
            if let Some(existing) = other.artifacts.iter().find(|path| path.is_file()) {
                return Some(existing.clone());
            }
        }
    }
    target.artifacts.first().cloned()
}

/// The executables one named configuration defines, with no other configuration's artifact.
///
/// A caller that asked for a configuration means that one: a Release build's artefact is not a
/// substitute for the RelWithDebInfo path the caller named, and a configuration that was not built
/// yet is answered with the path its build will write, not with a sibling's file.
pub fn executables_in(model: &Codemodel, configuration: &str) -> Vec<(String, PathBuf)> {
    let Some(active) = model.configuration(configuration) else {
        return Vec::new();
    };
    let mut found: Vec<(String, PathBuf)> = Vec::new();
    for target in &active.targets {
        if !target.kind.is_executable() || found.iter().any(|(name, _)| name == &target.name) {
            continue;
        }
        let artifact = target
            .artifacts
            .iter()
            .find(|path| path.is_file())
            .or_else(|| target.artifacts.first())
            .cloned();
        if let Some(path) = artifact {
            found.push((target.name.clone(), path));
        }
    }
    found
}

/// The executables a build tree's reply names, or nothing when there is no readable reply.
///
/// A tree CMake has never configured, or one whose reply was written by a CMake too old for the
/// API, answers empty and the launch falls back to the conventional file-name search.
pub fn cmake_run_targets(build_root: &Path) -> Vec<(String, PathBuf)> {
    match read_codemodel(build_root) {
        Ok(model) => executables(&model, PREFERRED_CONFIGURATION),
        Err(_) => Vec::new(),
    }
}

/// The executables one configuration of a build tree names, for a caller that asked for it.
///
/// A tree whose model names no such configuration — a single-config generator configured for one —
/// answers empty, and the caller falls back to [`cmake_run_targets`] rather than losing its target.
pub fn cmake_run_targets_in(build_root: &Path, configuration: &str) -> Vec<(String, PathBuf)> {
    match read_codemodel(build_root) {
        Ok(model) => executables_in(&model, configuration),
        Err(_) => Vec::new(),
    }
}
