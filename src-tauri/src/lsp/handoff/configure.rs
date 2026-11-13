#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::process::{Command, Stdio};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use crate::build_task::{CmakeOptions, cmake_plan};

use super::*;

/// Configure the tree that owns this database, through the project's own model.
pub fn configure(root: &Path, database_dir: &Path) -> Result<(), String> {
    let mut command = crate::resolve::command(crate::build_task::CMAKE_PROGRAM)?;
    command
        .args(configure_argv(root, database_dir))
        .current_dir(root)
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let stderr = run_bounded(command, CONFIGURE_TIMEOUT)?;
    if stderr.success {
        return Ok(());
    }
    Err(format!("cmake configure failed: {}", tail(&stderr.text)))
}

/// The configure command line, program excluded.
///
/// The project's model decides it whenever it names this exact tree, so a preset's toolchain file
/// and generator are honoured instead of being replaced by a bare recipe; the recipe remains the
/// answer for a tree no model names, and for a project whose files say nothing.
pub fn configure_argv(root: &Path, database_dir: &Path) -> Vec<String> {
    let plan = cmake_plan(root, false, &CmakeOptions::for_root(root)).ok();
    let Some(plan) = plan.filter(|plan| plan.build_root == database_dir) else {
        return argv(root, database_dir);
    };
    // `plan.configure` carries the program first; this returns flags only.
    let flags = plan.configure.iter().skip(1).cloned().collect();
    without_build_type(flags, database_dir)
}

/// Keep the build type a configured tree already has.
///
/// Reconfiguring an existing Release tree to export the database must not flip it to Debug, so the
/// plan's `-DCMAKE_BUILD_TYPE` is only passed for a directory that has never been configured.
fn without_build_type(args: Vec<String>, database_dir: &Path) -> Vec<String> {
    if !database_dir.join(crate::build_task::CMAKE_CACHE).is_file() {
        return args;
    }
    args.into_iter()
        .filter(|arg| !arg.starts_with("-DCMAKE_BUILD_TYPE="))
        .collect()
}

/// The explicit `-S <root> -B <dir> -DCMAKE_EXPORT_COMPILE_COMMANDS=ON` recipe.
///
/// The build type is only set for a directory that has never been configured: reconfiguring an
/// existing Release tree must not flip it to Debug just to export the database.
pub fn argv(root: &Path, database_dir: &Path) -> Vec<String> {
    let mut argv = vec![
        "-S".to_string(),
        root.display().to_string(),
        "-B".to_string(),
        database_dir.display().to_string(),
        "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON".to_string(),
    ];
    if !database_dir.join(crate::build_task::CMAKE_CACHE).is_file() {
        argv.push(format!(
            "-DCMAKE_BUILD_TYPE={}",
            crate::build_task::CMAKE_CONFIG_DEBUG
        ));
    }
    argv
}
