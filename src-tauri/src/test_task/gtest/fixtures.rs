#![allow(unused_imports)]

pub use std::fs;

use super::*;

/// Temporary projects the gtest tests build: a launch file, a fake binary and its preset.
pub fn project(root: &Path, kind: ProjectKind) -> ProjectInfo {
    ProjectInfo {
        root: crate::project::display(root),
        opened_root: crate::project::display(root),
        name: "demo".to_string(),
        kind,
        build_root: crate::project::display(root),
        launch_config: None,
    }
}

/// Writes `.quarry/launch.json` naming each preset's program.
pub fn launch(root: &Path, presets: &[(&str, &str)]) {
    let presets: Vec<String> = presets
        .iter()
        .map(|(name, program)| format!(r#"{{"name":"{name}","program":"{program}"}}"#))
        .collect();
    fs::create_dir_all(root.join(".quarry")).expect("launch dir");
    fs::write(
        root.join(".quarry").join("launch.json"),
        format!(r#"{{"configurations":[{}]}}"#, presets.join(",")),
    )
    .expect("launch file");
}

/// A `/bin/sh` script that answers `--gtest_list_tests` and any filter.
#[cfg(unix)]
pub fn script(root: &Path, name: &str, body: &str) -> PathBuf {
    use std::os::unix::fs::PermissionsExt;
    let path = root.join(name);
    fs::write(&path, format!("#!/bin/sh\n{body}\n")).expect("script");
    fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).expect("chmod");
    path
}
