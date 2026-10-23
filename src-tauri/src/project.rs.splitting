//! Project model.
//!
//! Given a directory, walk up for `Cargo.toml`, `CMakeLists.txt` or `compile_commands.json`, decide
//! the kind, derive the build root and the name, and report whether `.quarry/launch.json` exists.
//! Never spawns a build.

use crate::types::{ProjectInfo, ProjectKind};
use std::fs;
use std::path::{Path, PathBuf};

const CARGO_MANIFEST: &str = "Cargo.toml";
const CMAKE_MANIFEST: &str = "CMakeLists.txt";
const COMPILE_COMMANDS: &str = "compile_commands.json";
const BUILD_DIR: &str = "build";
const LAUNCH_CONFIG: &str = ".quarry/launch.json";

/// Inspects a project root: canonicalises it, walks up for a build marker, and reports kind, name,
/// build root and launch config. Never spawns a build.
pub fn inspect(root: &str) -> Result<ProjectInfo, String> {
    let canonical = Path::new(root)
        .canonicalize()
        .map_err(|error| format!("cannot open project root {root}: {error}"))?;
    if !canonical.is_dir() {
        return Err(format!("not a directory: {root}"));
    }

    let (kind, build_root, cargo_manifest) = match detect(&canonical) {
        Some(detected) => (detected.kind, detected.build_root, detected.cargo_manifest),
        None => (ProjectKind::Unknown, canonical.clone(), None),
    };

    let name = cargo_manifest
        .as_deref()
        .and_then(cargo_package_name)
        .unwrap_or_else(|| directory_name(&canonical));

    Ok(ProjectInfo {
        root: display(&canonical),
        name,
        kind,
        build_root: display(&build_root),
        launch_config: launch_config_path(&canonical),
    })
}

#[tauri::command]
pub fn open_project(root: String) -> Result<ProjectInfo, String> {
    inspect(&root)
}

struct Detected {
    kind: ProjectKind,
    /// Directory a build command runs in: the manifest directory, or a `build` directory when the
    /// only marker is a nested `compile_commands.json`.
    build_root: PathBuf,
    /// `Cargo.toml` to read the package name from, when a Cargo manifest won.
    cargo_manifest: Option<PathBuf>,
}

/// Nearest ancestor wins; within one directory the markers are tried in priority order
/// (`Cargo.toml`, `CMakeLists.txt`, `compile_commands.json`, then `build/compile_commands.json`).
fn detect(root: &Path) -> Option<Detected> {
    for ancestor in root.ancestors() {
        let cargo_manifest = ancestor.join(CARGO_MANIFEST);
        if cargo_manifest.is_file() {
            return Some(Detected {
                kind: ProjectKind::Cargo,
                build_root: ancestor.to_path_buf(),
                cargo_manifest: Some(cargo_manifest),
            });
        }
        if ancestor.join(CMAKE_MANIFEST).is_file() {
            return Some(Detected {
                kind: ProjectKind::Cmake,
                build_root: ancestor.to_path_buf(),
                cargo_manifest: None,
            });
        }
        if ancestor.join(COMPILE_COMMANDS).is_file() {
            return Some(Detected {
                kind: ProjectKind::CompileCommands,
                build_root: ancestor.to_path_buf(),
                cargo_manifest: None,
            });
        }
        let build_root = ancestor.join(BUILD_DIR);
        if build_root.join(COMPILE_COMMANDS).is_file() {
            return Some(Detected {
                kind: ProjectKind::CompileCommands,
                build_root,
                cargo_manifest: None,
            });
        }
    }
    None
}

/// Reads `name` from the `[package]` table of a Cargo manifest with a line scan.
///
/// Only the exact `[package]` section counts, so `[dependencies]`, `[package.metadata]` and
/// commented-out keys never supply the name.
fn cargo_package_name(manifest: &Path) -> Option<String> {
    let text = fs::read_to_string(manifest).ok()?;
    let mut section = String::new();

    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if line.starts_with('[') {
            section = match line.split_once(']') {
                Some((header, _)) => header.trim_start_matches('[').trim().to_string(),
                None => line.trim_start_matches('[').trim().to_string(),
            };
            continue;
        }

        if section != "package" {
            continue;
        }

        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if key.trim() != "name" {
            continue;
        }

        let name = unquote(value);
        if !name.is_empty() {
            return Some(name);
        }
    }

    None
}

/// Strips surrounding quotes and any trailing comment from a manifest value.
fn unquote(value: &str) -> String {
    let value = value.trim();
    for quote in ['"', '\''] {
        if let Some(rest) = value.strip_prefix(quote) {
            return rest
                .split(quote)
                .next()
                .unwrap_or_default()
                .trim()
                .to_string();
        }
    }
    value
        .split('#')
        .next()
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn directory_name(root: &Path) -> String {
    root.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| display(root))
}

fn launch_config_path(root: &Path) -> Option<String> {
    let candidate = root.join(LAUNCH_CONFIG);
    candidate.is_file().then(|| display(&candidate))
}

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    /// Throwaway directory under the system temp dir, removed on drop.
    struct Fixture {
        path: PathBuf,
    }

    impl Fixture {
        fn new(label: &str) -> Self {
            let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = env::temp_dir().join(format!(
                "quarry-project-{label}-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create fixture directory");
            Self { path }
        }

        fn write(&self, name: &str, contents: &str) {
            let target = self.path.join(name);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).expect("create fixture parent");
            }
            fs::write(target, contents).expect("write fixture file");
        }

        /// Canonical path, which is what `open_project` reports on macOS (temp dir is a symlink).
        fn root(&self) -> PathBuf {
            self.path.canonicalize().expect("canonicalize fixture")
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn cargo_manifest_wins_over_cmake_in_the_same_directory() {
        let fixture = Fixture::new("priority");
        fixture.write(
            "Cargo.toml",
            "[package]\nname = \"from-cargo\"\nversion = \"0.1.0\"\n",
        );
        fixture.write("CMakeLists.txt", "project(from_cmake)\n");

        let info =
            open_project(fixture.root().to_string_lossy().into_owned()).expect("open project");

        assert_eq!(info.kind, ProjectKind::Cargo);
        assert_eq!(info.name, "from-cargo");
        assert_eq!(Path::new(&info.build_root), fixture.root());
        assert_eq!(info.launch_config, None);
    }

    #[test]
    fn name_comes_from_the_package_section_only() {
        let fixture = Fixture::new("name");
        fixture.write(
            "Cargo.toml",
            concat!(
                "[package]\n",
                "version = \"0.1.0\"\n",
                "# name = \"commented-out\"\n",
                "  name   =   \"right-name\"  \n",
                "\n",
                "[package.metadata.docs]\n",
                "name = \"wrong-metadata\"\n",
                "\n",
                "[dependencies]\n",
                "name = \"wrong-dependency\"\n",
            ),
        );

        let info =
            open_project(fixture.root().to_string_lossy().into_owned()).expect("open project");

        assert_eq!(info.kind, ProjectKind::Cargo);
        assert_eq!(info.name, "right-name");
    }

    #[test]
    fn empty_directory_is_unknown_and_never_an_error() {
        let fixture = Fixture::new("empty");
        let root = fixture.root();

        let info = open_project(root.to_string_lossy().into_owned()).expect("open project");
        let fallback = root
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .expect("fixture has a file name");

        assert_eq!(info.kind, ProjectKind::Unknown);
        assert_eq!(Path::new(&info.build_root), root);
        assert_eq!(info.root, root.to_string_lossy());
        assert_eq!(info.name, fallback);
        assert_eq!(info.launch_config, None);
    }

    #[test]
    fn launch_config_is_reported_when_present() {
        let fixture = Fixture::new("launch");
        fixture.write("compile_commands.json", "[]\n");
        fixture.write(".quarry/launch.json", "{}\n");
        let root = fixture.root();

        let info = open_project(root.to_string_lossy().into_owned()).expect("open project");
        let expected = root
            .join(".quarry/launch.json")
            .to_string_lossy()
            .into_owned();

        assert_eq!(info.kind, ProjectKind::CompileCommands);
        assert_eq!(info.launch_config, Some(expected));
    }

    #[test]
    fn a_missing_root_is_an_error() {
        let fixture = Fixture::new("missing");
        let missing = fixture.path.join("does-not-exist");

        let error = open_project(missing.to_string_lossy().into_owned()).expect_err("should fail");
        assert!(
            error.contains("does-not-exist"),
            "unexpected error: {error}"
        );
    }
}
