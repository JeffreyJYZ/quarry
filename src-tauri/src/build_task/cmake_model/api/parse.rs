//! Reading the replied JSON into targets, groups and their resolved paths.
//!
//! Kept apart from [`super::model`] so the model's own types stay readable: everything here is a
//! translation of one reply file, and every path it produces is already absolute.

#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub use serde_json::Value;

use super::*;

/// One configuration, with each of its targets read from the file the index names.
pub(super) fn parse_configuration(
    value: &Value,
    build_root: &Path,
    source_root: &Path,
    reply_root: &Path,
) -> Result<Configuration, String> {
    let name = value["name"].as_str().unwrap_or_default().to_string();
    let mut targets = Vec::new();
    for entry in value["targets"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default()
    {
        let file = entry["jsonFile"]
            .as_str()
            .ok_or_else(|| format!("target {name} records no jsonFile"))?;
        let target = read_value(&reply_dir(reply_root).join(file))?;
        if let Some(target) = parse_target(&target, &name, build_root, source_root)? {
            targets.push(target);
        }
    }
    Ok(Configuration { name, targets })
}

/// A target file with no name is not a target a reader can act on.
fn parse_target(
    value: &Value,
    configuration: &str,
    build_root: &Path,
    source_root: &Path,
) -> Result<Option<Target>, String> {
    let Some(name) = value["name"].as_str().filter(|name| !name.is_empty()) else {
        return Ok(None);
    };
    let build_dir = join_path(build_root, value["paths"]["build"].as_str().unwrap_or("."));
    let source_dir = join_path(
        source_root,
        value["paths"]["source"].as_str().unwrap_or("."),
    );
    let kind = TargetKind::parse(value["type"].as_str().unwrap_or_default());
    let artifacts = strings(value, "artifacts", "path")
        .into_iter()
        .map(|path| join_path(build_root, &path))
        .collect::<Vec<PathBuf>>();
    let sources = value["sources"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();
    let groups = value["compileGroups"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default()
        .iter()
        .map(|group| parse_group(group, sources, &source_dir))
        .collect();

    Ok(Some(Target {
        name: name.to_string(),
        kind,
        configuration: configuration.to_string(),
        build_dir,
        artifacts,
        groups,
    }))
}

fn parse_group(group: &Value, sources: &[Value], source_dir: &Path) -> CompileGroup {
    let includes = group["includes"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default()
        .iter()
        .filter_map(|include| {
            Some(IncludePath {
                path: join_path(source_dir, include["path"].as_str()?),
                system: include["isSystem"].as_bool().unwrap_or(false),
            })
        })
        .collect();
    let defines = strings(group, "defines", "define");
    let fragments = strings(group, "compileCommandFragments", "fragment");
    let indexes = group["sourceIndexes"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();
    let sources = indexes
        .iter()
        .filter_map(|index| index.as_u64())
        .filter_map(|index| {
            sources
                .get(usize::try_from(index).ok()?)?
                .get("path")?
                .as_str()
        })
        .map(|path| join_path(source_dir, path))
        .collect();

    CompileGroup {
        language: group["language"].as_str().map(str::to_string),
        includes,
        defines,
        fragments,
        sources,
    }
}

/// The string values a keyed array carries (`artifacts[].path`, `defines[].define`, …).
fn strings(value: &Value, array: &str, key: &str) -> Vec<String> {
    value[array]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default()
        .iter()
        .filter_map(|item| item[key].as_str())
        .map(str::to_string)
        .collect()
}

/// A path field, or `None` when it is absent or empty.
pub(super) fn path_field(value: &Value) -> Option<PathBuf> {
    value
        .as_str()
        .filter(|text| !text.is_empty())
        .map(PathBuf::from)
}

/// Join a recorded path to its base; `.` is the base itself, and an absolute path already wins.
fn join_path(base: &Path, value: &str) -> PathBuf {
    let path = Path::new(value);
    if path.is_absolute() {
        return path.to_path_buf();
    }
    if value == "." || value.is_empty() {
        return base.to_path_buf();
    }
    base.join(path)
}
