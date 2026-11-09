#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// Where a target's own link step writes its program, read from the generated build tree.
///
/// `OUTPUT_NAME` and `RUNTIME_OUTPUT_DIRECTORY` make the file's name and directory differ from the
/// target name `Built target …` prints, so no path shaped like the name can find it. Each generator
/// records the real path in its own file, and that file is the authority: Unix Makefiles in
/// `<CMakeFiles>/<target>.dir/link.txt`, Ninja in the alias `build <target>: phony <output>` that
/// `build.ninja` and every `build-<Config>.ninja` carry.
///
/// A generator that records neither (Xcode, Visual Studio) returns nothing here, and the caller
/// keeps the bounded walk it already had.
pub fn target_output(build_root: &Path, name: &str) -> Vec<PathBuf> {
    let mut outputs = link_output(build_root, name);
    for output in ninja_outputs(build_root, name) {
        push_unique(&mut outputs, output);
    }
    outputs
}

/// The linker's own output argument, from the `link.txt` CMake writes for a Makefiles target.
///
/// `TargetDirectories.txt` indexes every target's directory with an absolute path, so a target of an
/// `add_subdirectory` project resolves without a walk. The output is relative to the directory that
/// holds `CMakeFiles`, which is the build root for a top-level target and the subdirectory's build
/// directory for a nested one.
fn link_output(build_root: &Path, name: &str) -> Vec<PathBuf> {
    let Some(directory) = target_directory(build_root, name) else {
        return Vec::new();
    };
    let Ok(text) = fs::read_to_string(directory.join("link.txt")) else {
        return Vec::new();
    };
    let base = directory
        .parent()
        .and_then(Path::parent)
        .unwrap_or(build_root);
    link_outputs(&text)
        .into_iter()
        .map(|output| base.join(output))
        .collect()
}

/// The `CMakeFiles/<target>.dir` directory the generated index names for `name`.
fn target_directory(build_root: &Path, name: &str) -> Option<PathBuf> {
    let index = build_root.join("CMakeFiles").join("TargetDirectories.txt");
    let text = fs::read_to_string(index).ok()?;
    let wanted = format!("{name}.dir");
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(PathBuf::from)
        .find(|path| path.file_name().and_then(|file| file.to_str()) == Some(wanted.as_str()))
}

/// `-o <path>`, the spelling every Unix linker uses; MSVC's link.exe writes `/out:<path>`.
fn link_outputs(text: &str) -> Vec<String> {
    let args: Vec<&str> = text.split_whitespace().collect();
    let mut outputs = Vec::new();
    for (index, arg) in args.iter().enumerate() {
        if let Some(value) = arg.strip_prefix("/out:") {
            outputs.push(value.to_string());
            continue;
        }
        // Only the standalone flag: `-order_file` and friends also start with `-o`.
        if *arg == "-o"
            && let Some(value) = args.get(index + 1)
        {
            outputs.push((*value).to_string());
        }
    }
    outputs
}

/// Every `phony` alias the Ninja files at the build root carry, one per configuration.
fn ninja_outputs(build_root: &Path, name: &str) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(build_root) else {
        return Vec::new();
    };
    let mut outputs = Vec::new();
    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().into_owned();
        if !is_ninja_file(&file_name) {
            continue;
        }
        let Ok(text) = fs::read_to_string(entry.path()) else {
            continue;
        };
        for output in alias_outputs(&text, name) {
            push_unique(&mut outputs, build_root.join(output));
        }
    }
    outputs
}

/// Only the files Ninja runs in carry the aliases; `CMakeFiles/impl-<Config>.ninja` escapes the
/// colon in `build <target>$:<Config>`, so it is deliberately not read.
fn is_ninja_file(name: &str) -> bool {
    name == "build.ninja" || (name.starts_with("build-") && name.ends_with(".ninja"))
}

/// The paths of `build <target>: phony <output>` lines, in file order.
fn alias_outputs(text: &str, name: &str) -> Vec<String> {
    let prefix = format!("build {name}: phony ");
    text.lines()
        .filter_map(|line| line.strip_prefix(&prefix))
        .map(str::trim)
        .filter(|output| !output.is_empty())
        .map(str::to_string)
        .collect()
}

fn push_unique(outputs: &mut Vec<PathBuf>, path: PathBuf) {
    if !outputs.iter().any(|seen| seen == &path) {
        outputs.push(path);
    }
}
