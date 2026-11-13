//! Deciding one build: the tree, both argv, and anything the user should be told.
//!
//! Two guarantees are kept here, whichever shape the project takes.
//!
//! A compiler database: clangd reads `compile_commands.json`, which only the Makefiles and Ninja
//! generators write, so `-DCMAKE_EXPORT_COMPILE_COMMANDS=ON` is passed unless the project already
//! set the variable itself — an explicit `OFF` is respected, because passing `ON` over it would be
//! quarry overruling the file it just read.
//!
//! A build type: a single-config generator ignores `--config` at build time and falls back to an
//! empty build type, which means no `-g`, no debug info, and a breakpoint that never resolves. When
//! a preset names `CMAKE_BUILD_TYPE` that value is used; when it does not, the profile's
//! configuration is passed and the note says so.

#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

pub use crate::build_task::{CMAKE_PROGRAM, cmake_config};

use super::*;

/// Everything one build runs, decided before the first child starts.
#[derive(Debug)]
pub struct CmakePlan {
    pub build_root: PathBuf,
    pub configure: Vec<String>,
    pub build: Vec<String>,
    /// What this configure must carry, so a tree configured with other values reads as stale.
    pub intent: ConfigureIntent,
    /// One line naming a choice the user might not expect, or `None` when everything was obvious.
    pub note: Option<String>,
}

/// Decide the whole build: the directory, both argv, and any note worth reporting.
pub fn cmake_plan(
    source_root: &Path,
    release: bool,
    options: &CmakeOptions,
) -> Result<CmakePlan, String> {
    let presets = super::preset::load(source_root);
    let selected = select_configure(&presets, &options.preset)?;
    let mut notes: Vec<String> = Vec::new();
    if selected.is_none() {
        let count = visible_configure(&presets);
        if count > 1 {
            notes.push(format!(
                "{count} configure presets in the file; set CMake preset to choose one"
            ));
        }
        if let Some(file) = presets.invalid.first() {
            notes.push(format!("{file} is not a preset file, so it was ignored"));
        }
    }

    let resolved = match selected.as_deref() {
        Some(name) => Some(super::preset_resolve::resolve_configure(
            &presets,
            name,
            source_root,
        )?),
        None => None,
    };

    let source = source_root.display().to_string();
    let Some(preset) = resolved else {
        let build_root = super::build_root::resolve(source_root, options, None);
        let dir = build_root.display().to_string();
        let mut configure = cmake_configure_argv(&source, &dir, release);
        let toolchain = options
            .toolchain()
            .map(|value| absolute(source_root, value));
        if let Some(toolchain) = &toolchain {
            configure.push(format!("-DCMAKE_TOOLCHAIN_FILE={}", toolchain.display()));
        }
        return Ok(CmakePlan {
            build_root,
            configure,
            build: cmake_build_argv(&dir, release),
            intent: ConfigureIntent {
                toolchain,
                build_type: Some(cmake_config(release).to_string()),
            },
            note: join(notes),
        });
    };

    let binary = super::preset_resolve::preset_binary(&preset, source_root);
    let build_root = super::build_root::resolve(source_root, options, Some(&binary));
    let dir = build_root.display().to_string();
    let configuration = configuration(&presets, &preset, release);
    let build_type = build_type(&preset, &configuration, &mut notes);
    let database = compile_database(&preset, &mut notes);
    let settings_toolchain = options
        .toolchain()
        .map(|value| absolute(source_root, value));
    let toolchain = settings_toolchain
        .clone()
        .or_else(|| preset_toolchain(&preset, source_root));
    // Only the settings value goes on the command line: a preset's own cache variable is applied by
    // `--preset`, and repeating it here would resolve a relative path differently than CMake does.
    let toolchain_arg = settings_toolchain.map(|path| path.display().to_string());

    let configure = preset_configure_argv(
        &preset.name,
        &source,
        &dir,
        build_type.as_deref(),
        database,
        toolchain_arg.as_deref(),
    );
    let build = match build_preset(&presets, &preset.name) {
        Some(named) if build_root == binary => preset_build_argv(&named.name, &configuration),
        _ => vec![
            CMAKE_PROGRAM.to_string(),
            "--build".to_string(),
            dir,
            "--config".to_string(),
            configuration,
        ],
    };

    Ok(CmakePlan {
        build_root,
        configure,
        build,
        intent: ConfigureIntent {
            toolchain,
            build_type,
        },
        note: join(notes),
    })
}

/// The toolchain file a preset configures with, expanded against the tree it describes.
fn preset_toolchain(preset: &ResolvedConfigure, root: &Path) -> Option<PathBuf> {
    let value = preset.cache.get(TOOLCHAIN_VARIABLE)?;
    Some(absolute(
        root,
        &super::preset_resolve::expand(value, root, &preset.name),
    ))
}

/// The configuration this build uses: the build preset's, then the configure preset's, then the profile.
fn configuration(presets: &Presets, preset: &ResolvedConfigure, release: bool) -> String {
    let named = build_preset(presets, &preset.name)
        .and_then(|named| super::preset_resolve::resolve_build(presets, &named.name));
    named
        .and_then(|named| named.configuration)
        .or_else(|| preset.cache.get("CMAKE_BUILD_TYPE").cloned())
        .unwrap_or_else(|| cmake_config(release).to_string())
}

/// The build type to pass, or `None` when the preset's own value stands.
fn build_type(
    preset: &ResolvedConfigure,
    configuration: &str,
    notes: &mut Vec<String>,
) -> Option<String> {
    if preset.cache.contains_key("CMAKE_BUILD_TYPE") {
        return None;
    }
    if is_multi_config(preset.generator.as_deref()) {
        // A multi-config generator takes its configuration at build time; nothing to force here.
        return None;
    }
    notes.push(format!(
        "preset {} sets no CMAKE_BUILD_TYPE, so -DCMAKE_BUILD_TYPE={configuration} keeps debug info",
        preset.name
    ));
    Some(configuration.to_string())
}

/// Whether a compiler database will be written, honouring a value the project set itself.
fn compile_database(preset: &ResolvedConfigure, notes: &mut Vec<String>) -> bool {
    match preset.cache.get("CMAKE_EXPORT_COMPILE_COMMANDS") {
        Some(value) if is_cache_on(value) => writes_compile_database(preset.generator.as_deref()),
        Some(value) => {
            notes.push(format!(
                "preset sets CMAKE_EXPORT_COMPILE_COMMANDS={value}, so no compiler database is written"
            ));
            false
        }
        None => writes_compile_database(preset.generator.as_deref()),
    }
}

fn join(notes: Vec<String>) -> Option<String> {
    if notes.is_empty() {
        None
    } else {
        Some(notes.join("; "))
    }
}
