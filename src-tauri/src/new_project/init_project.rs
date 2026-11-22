//! Initialize a project inside a directory the user already opened.
//!
//! Unlike [`create_project`], which makes a fresh `<parent>/<name>` directory, this command fills
//! the directory it is handed. It reuses the same templates and standard resolution so the two
//! paths can never drift, but refuses to touch a directory that already holds anything meaningful.

#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::ProjectInfo;
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// Entries that never count as meaningful content: our own state and Finder hygiene files.
const IGNORED_ENTRIES: [&str; 2] = [".DS_Store", ".git"];

/// List directory entries that block initialization.
///
/// A `.quarry/` directory is ours and may be left from the previous (project-less) open; a `.git`
/// entry and `.DS_Store` are harmless. Everything else is reported so the dialog can say why.
fn occupancy_offenders(root: &Path) -> Result<Vec<String>, String> {
    let entries =
        fs::read_dir(root).map_err(|e| format!("cannot read directory {}: {e}", root.display()))?;
    let mut offenders = Vec::new();
    for entry in entries {
        let entry =
            entry.map_err(|e| format!("cannot read an entry in {}: {e}", root.display()))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name == ".quarry" {
            if entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
                continue;
            }
        } else if IGNORED_ENTRIES.contains(&name.as_str()) {
            continue;
        }
        offenders.push(name);
    }
    Ok(offenders)
}

/// The shared refusal used both by the occupancy check and by a would-be overwrite.
fn occupancy_error(offenders: &[String]) -> String {
    let shown: Vec<&str> = offenders.iter().take(3).map(String::as_str).collect();
    format!(
        "directory already holds {}; initialize needs an empty directory (or only .quarry/, .git, .DS_Store)",
        shown.join(", ")
    )
}

/// Write a starter file, refusing if the path already exists rather than replacing it.
pub fn write_new_file(root: &Path, rel: &str, contents: &str) -> Result<(), String> {
    let path = root.join(rel);
    if path.exists() {
        return Err(occupancy_error(&[rel.to_string()]));
    }
    write_file(root, rel, contents)
}

/// The project name for a scaffold in `root`: the name of the directory being initialized.
fn project_name(root: &Path) -> String {
    root.file_name()
        .unwrap_or(root.as_os_str())
        .to_string_lossy()
        .into_owned()
}

/// Scaffold one of the four supported kinds into `root` itself and return the opened project.
#[tauri::command]
pub fn init_project(root: String, kind: String, standard: String) -> Result<ProjectInfo, String> {
    let root_path = Path::new(root.trim());
    if !root_path.is_absolute() {
        return Err(format!("root must be an absolute path: {root}"));
    }
    if !root_path.is_dir() {
        return Err(format!("root directory does not exist: {root}"));
    }

    let offenders = occupancy_offenders(root_path)?;
    if !offenders.is_empty() {
        return Err(occupancy_error(&offenders));
    }

    match kind.as_str() {
        "rust-bin" | "rust-lib" | "c-cmake" | "cpp-cmake" => {}
        _ => {
            return Err(format!(
                "unknown project kind \"{kind}\"; accepted values: rust-bin, rust-lib, c-cmake, cpp-cmake."
            ));
        }
    }

    let standard = resolve_standard(&kind, standard.trim())?;
    let name = project_name(root_path);

    match kind.as_str() {
        "rust-bin" => {
            write_new_file(root_path, "Cargo.toml", &rust_cargo_toml(&name, &standard))?;
            write_new_file(root_path, "src/main.rs", &with_name(RUST_MAIN, &name))?;
            write_new_file(root_path, ".gitignore", GITIGNORE_TARGET)?;
        }
        "rust-lib" => {
            write_new_file(root_path, "Cargo.toml", &rust_cargo_toml(&name, &standard))?;
            write_new_file(root_path, "src/lib.rs", RUST_LIB)?;
            write_new_file(root_path, ".gitignore", GITIGNORE_TARGET)?;
        }
        "c-cmake" => {
            write_new_file(
                root_path,
                "CMakeLists.txt",
                &c_cmake_lists(&name, &standard),
            )?;
            write_new_file(root_path, "src/main.c", &with_name(C_MAIN, &name))?;
            write_new_file(root_path, ".gitignore", GITIGNORE_BUILD)?;
        }
        "cpp-cmake" => {
            write_new_file(
                root_path,
                "CMakeLists.txt",
                &cpp_cmake_lists(&name, &standard),
            )?;
            write_new_file(root_path, "src/main.cpp", &with_name(CPP_MAIN, &name))?;
            write_new_file(root_path, ".gitignore", GITIGNORE_BUILD)?;
        }
        _ => unreachable!(),
    }

    project::open_project(root_path.to_string_lossy().into_owned())
}
