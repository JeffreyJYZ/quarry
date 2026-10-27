#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{LaunchConfig, ProjectInfo, RunTarget};
pub use std::path::{Path, PathBuf};

use super::*;

/// `RunTarget::kind` for a C/C++ executable.
pub const CPP_KIND: &str = "cpp";

/// Every executable the C/C++ composition can name, in its own candidate order.
///
/// [`cpp_executables`] is the single source of truth: the default composition takes its first
/// entry, so a listed target and the prefilled program can never disagree.
pub fn list_cpp_targets(info: &ProjectInfo) -> Vec<RunTarget> {
    cpp_executables(info)
        .into_iter()
        .map(|(name, path)| {
            let target = executable_stem(&path, &name);
            RunTarget {
                id: format!("{CPP_PREFIX}{target}"),
                label: target.clone(),
                kind: CPP_KIND.to_string(),
                package: String::new(),
                target,
            }
        })
        .collect()
}

/// The executable stem, which is what the dropdown shows and what an id carries.
///
/// A CMake target and the file it produces share a name, so the stem is the target name in every
/// ordinary project; the candidate name is the fallback for a path that ends in no stem.
pub fn executable_stem(path: &Path, name: &str) -> String {
    path.file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .filter(|stem| !stem.is_empty())
        .unwrap_or_else(|| name.to_string())
}

/// Resolve one named executable; a name the project does not offer is an error naming it.
///
/// The C/C++ branch never fails on a missing file, matching [`compose_cpp`]: before the first build
/// it names the path that build will write, and the toolbar's build step writes it.
pub fn resolve_cpp(
    info: &ProjectInfo,
    target: &str,
    stop_on_entry: bool,
) -> Result<LaunchConfig, String> {
    let known = cpp_executables(info);
    let found = known
        .iter()
        .find(|(name, path)| executable_stem(path, name) == target)
        .ok_or_else(|| {
            format!(
                "unknown run target \"{CPP_PREFIX}{target}\" in {}: this project offers {}",
                info.root,
                cpp_names(info)
            )
        })?;

    Ok(LaunchConfig {
        program: display(&found.1),
        args: Vec::new(),
        cwd: info.root.clone(),
        stop_on_entry,
        init_commands: Vec::new(),
    })
}

/// The executable names a project offers, quoted, for an error a reader can act on.
pub fn cpp_names(info: &ProjectInfo) -> String {
    let names = list_cpp_targets(info)
        .into_iter()
        .map(|target| format!("\"{}\"", target.id))
        .collect::<Vec<String>>();
    if names.is_empty() {
        return "no executable".to_string();
    }
    names.join(", ")
}
