#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{LaunchConfig, ProjectInfo, ProjectKind};
pub use regex::Regex;
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// Directory CMake projects conventionally build into.
pub const CMAKE_BUILD_DIR: &str = "build";

/// Directory quarry's own plain-clang build writes, relative to the project root.
pub const QUARRY_BUILD_DIR: &str = ".quarry/build";

/// Subdirectories a multi-config generator (Xcode, Visual Studio) adds under the build directory.
pub const MULTI_CONFIG_DIRS: [&str; 2] = ["Debug", "Release"];

/// Out-of-source directories CLion creates by convention.
pub const CLION_BUILD_DIRS: [&str; 2] = ["cmake-build-debug", "cmake-build-release"];

/// The root manifest an executable target is read from; `cmp`-free, one file only.
pub const CMAKE_MANIFEST: &str = "CMakeLists.txt";

/// The first literal argument of an `add_executable` call, ignoring a variable argument.
pub const CMAKE_EXECUTABLE: &str =
    r"(?im)^[ \t]*add_executable[ \t]*\([ \t\r\n]*([A-Za-z0-9_.+-]+)";

/// The literal project name, used when the executable line names a variable instead.
pub const CMAKE_PROJECT: &str = r"(?im)^[ \t]*project[ \t]*\([ \t\r\n]*([A-Za-z0-9_.+-]+)";

/// Builds the launch configuration for a C/C++ project without running a build.
///
/// No manifest names the executable, so this is a best-effort composition: an artifact a build
/// already produced wins, and before the first build the configuration still names the path that
/// build will write. That keeps the run form prefilled instead of failing like the Cargo branch
/// does for a missing binary, because the user can build from the toolbar and press Run again.
pub fn compose_cpp(info: &ProjectInfo, stop_on_entry: bool) -> LaunchConfig {
    let root = Path::new(&info.root);
    let program = cpp_executables(info).into_iter().next().map_or_else(
        || fallback_program(root, &info.name, info.kind),
        |(_, path)| path,
    );

    LaunchConfig {
        program: display(&program),
        args: Vec::new(),
        cwd: info.root.clone(),
        stop_on_entry,
        init_commands: Vec::new(),
    }
}

/// The executables a C/C++ project can name, one per candidate name, most likely first.
///
/// This is the only candidate walk: [`compose_cpp`] takes the first entry, so the default launch and
/// the toolbar's target list cannot disagree about which program a project has. A project with
/// nothing built yet still yields one entry, the path its build will write, which is what the
/// prefilled composition names.
pub fn cpp_executables(info: &ProjectInfo) -> Vec<(String, PathBuf)> {
    let root = Path::new(&info.root);
    let names = program_names(root, &info.name, info.kind);
    let mut found: Vec<(String, PathBuf)> = Vec::new();

    for name in &names {
        let Some(path) = first_existing(&paths_for_name(root, name, info.kind)) else {
            continue;
        };
        if found.iter().any(|(_, existing)| *existing == path) {
            continue;
        }
        found.push((name.clone(), path));
    }

    if found.is_empty() {
        let primary = names.first().cloned().unwrap_or_else(|| info.name.clone());
        let path = fallback_program(root, &primary, info.kind);
        found.push((primary, path));
    }

    found
}

/// Names the executable may carry, most likely first: the CMake target, then the directory name.
///
/// The target wins because a CMake project's directory rarely matches the name its
/// `add_executable` gives the binary; the directory name stays as the fallback for a manifest that
/// names its target through a variable, or for a project without one.
pub fn program_names(root: &Path, directory_name: &str, kind: ProjectKind) -> Vec<String> {
    let mut names = Vec::new();
    if kind == ProjectKind::Cmake
        && let Some(target) = cmake_target(root)
    {
        names.push(target);
    }
    if !names.iter().any(|name| name == directory_name) {
        names.push(directory_name.to_string());
    }
    names
}

/// The first literal executable target in the root manifest, else the literal project name.
///
/// Only the root `CMakeLists.txt` is read: a target declared through `add_subdirectory` is not
/// found, which is why the directory name remains a candidate. A variable argument captures
/// nothing, so it falls through instead of naming a binary called `${PROJECT_NAME}`.
pub fn cmake_target(root: &Path) -> Option<String> {
    let text = fs::read_to_string(root.join(CMAKE_MANIFEST)).ok()?;
    for pattern in [CMAKE_EXECUTABLE, CMAKE_PROJECT] {
        let regex = Regex::new(pattern).ok()?;
        if let Some(name) = regex.captures(&text).and_then(|captures| captures.get(1)) {
            return Some(name.as_str().to_string());
        }
    }
    None
}

/// The conventional locations one name may occupy, by project kind.
pub fn paths_for_name(root: &Path, name: &str, kind: ProjectKind) -> Vec<PathBuf> {
    match kind {
        ProjectKind::Cmake => {
            let build = root.join(CMAKE_BUILD_DIR);
            let mut paths = vec![root.join(name)];
            for config in MULTI_CONFIG_DIRS {
                paths.push(root.join(config).join(name));
            }
            paths.push(build.join(name));
            for config in MULTI_CONFIG_DIRS {
                paths.push(build.join(config).join(name));
            }
            for directory in CLION_BUILD_DIRS {
                paths.push(root.join(directory).join(name));
            }
            paths
        }
        _ => vec![
            root.join(QUARRY_BUILD_DIR).join(name),
            root.join(CMAKE_BUILD_DIR).join(name),
            root.join(name),
        ],
    }
}

/// The first candidate a build has already produced, or `None` before the first build.
pub fn first_existing(candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates.iter().find(|path| path.is_file()).cloned()
}

/// The path to name before any build exists.
///
/// A CMake project with a `build` directory gets an out-of-source path under it; otherwise the
/// top-level path a generator in the root writes. The other kinds get quarry's own build output,
/// which is the only executable quarry itself knows how to produce for them.
pub fn fallback_program(root: &Path, name: &str, kind: ProjectKind) -> PathBuf {
    match kind {
        ProjectKind::Cmake => {
            let build = root.join(CMAKE_BUILD_DIR);
            if build.is_dir() {
                build.join(name)
            } else {
                root.join(name)
            }
        }
        _ => root.join(QUARRY_BUILD_DIR).join(name),
    }
}
