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
//! configuration is passed and the note says so. A tree that names no generator at all keeps the
//! type for the same reason and the note says CMake is the one choosing; once the tree reports its
//! generator, every later plan follows that report instead of guessing.
//!
//! [`cmake_plan_target`] also decides *what* is built: a named target adds `--target <name>`, and
//! `None` keeps the whole tree, which is what the toolbar's Build action asks for.

#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

pub use crate::build_task::{BuildProfile, CMAKE_PROGRAM, cmake_config};

use super::*;

use crate::build_task::{external, external_str};

/// Everything one build runs, decided before the first child starts.
#[derive(Debug)]
pub struct CmakePlan {
    pub build_root: PathBuf,
    pub configure: Vec<String>,
    pub build: Vec<String>,
    /// The configuration this build uses, which is also the one analysis must describe.
    ///
    /// A multi-config generator builds one configuration per `--config`, and CLion analyses the one
    /// being built, so this name travels with the plan: the hand-off selects that configuration's
    /// entries instead of the `Debug` ones that lead CMake's reply.
    pub configuration: String,
    /// The generator the plan honoured, or `None` when nothing on disk named one.
    ///
    /// Reported as data rather than prose: a caller can say what the build was configured with, and
    /// `None` is the one honest answer for a tree whose generator CMake is still to choose.
    pub generator: Option<String>,
    /// What this configure must carry, so a tree configured with other values reads as stale.
    pub intent: ConfigureIntent,
    /// One line naming a choice the user might not expect, or `None` when everything was obvious.
    pub note: Option<String>,
}

/// Decide the whole build: the directory, both argv, and any note worth reporting.
///
/// A boolean profile is still accepted for the language-server hand-off, which configures Debug and
/// has no user in front of it to choose otherwise.
pub fn cmake_plan(
    source_root: &Path,
    profile: impl Into<BuildProfile>,
    options: &CmakeOptions,
) -> Result<CmakePlan, String> {
    cmake_plan_target(source_root, profile, options, None)
}

/// Decide one build of one target: `target` adds `--target <name>`, `None` builds everything.
pub fn cmake_plan_target(
    source_root: &Path,
    profile: impl Into<BuildProfile>,
    options: &CmakeOptions,
    target: Option<&str>,
) -> Result<CmakePlan, String> {
    let profile = profile.into();
    let target = target.map(str::trim).filter(|name| !name.is_empty());
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
        let recipe = recipe_configure(&source, &dir, &build_root, profile, &mut notes);
        let mut configure = recipe.configure;
        let toolchain = options
            .toolchain()
            .map(|value| absolute(source_root, value));
        if let Some(toolchain) = &toolchain {
            configure.push(format!("-DCMAKE_TOOLCHAIN_FILE={}", external(toolchain)));
        }
        let generator = generator_name(&build_root, None);
        return Ok(CmakePlan {
            build_root,
            configure,
            build: cmake_build_argv(&dir, profile, target),
            configuration: cmake_config(profile).to_string(),
            generator,
            intent: ConfigureIntent {
                toolchain,
                build_type: recipe.build_type,
            },
            note: join(notes),
        });
    };

    let binary = super::preset_resolve::preset_binary(&preset, source_root);
    let build_root = super::build_root::resolve(source_root, options, Some(&binary));
    let dir = build_root.display().to_string();
    let configuration = configuration(&presets, &preset, profile);
    let build_type = build_type(&preset, &configuration, &build_root, &mut notes);
    let database = compile_database(&preset, &build_root, &mut notes);
    let settings_toolchain = options
        .toolchain()
        .map(|value| absolute(source_root, value));
    let toolchain = settings_toolchain
        .clone()
        .or_else(|| preset_toolchain(&preset, source_root));
    // Only the settings value goes on the command line: a preset's own cache variable is applied by
    // `--preset`, and repeating it here would resolve a relative path differently than CMake does.
    let toolchain_arg = settings_toolchain.map(|path| external(&path));

    let configure = preset_configure_argv(
        &preset.name,
        &source,
        &dir,
        build_type.as_deref(),
        database,
        toolchain_arg.as_deref(),
    );
    let build = match build_preset(&presets, &preset.name) {
        Some(named) if build_root == binary => {
            preset_build_argv(&named.name, &configuration, target)
        }
        _ => {
            let mut argv = vec![
                CMAKE_PROGRAM.to_string(),
                "--build".to_string(),
                dir,
                "--config".to_string(),
                configuration.clone(),
            ];
            if let Some(target) = target {
                argv.push("--target".to_string());
                argv.push(target.to_string());
            }
            argv
        }
    };

    let generator = generator_name(&build_root, preset.generator.as_deref());
    Ok(CmakePlan {
        build_root,
        configure,
        build,
        configuration,
        generator,
        intent: ConfigureIntent {
            toolchain,
            build_type,
        },
        note: join(notes),
    })
}
