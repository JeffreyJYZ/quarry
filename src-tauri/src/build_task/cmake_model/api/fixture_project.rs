#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;
use crate::build_task::*;
use crate::test_support::TempDir;

/// The generator this fixture configures with; the file API gap it proves is its own.
pub const GENERATOR: &str = "Ninja Multi-Config";

/// Whether this machine can run the fixture at all.
fn available() -> bool {
    crate::resolve::resolve(CMAKE_PROGRAM).is_some()
}

/// Whether this machine's cmake offers the generator; the fixture skips rather than failing.
fn offers_generator() -> bool {
    let Ok(output) = std::process::Command::new(CMAKE_PROGRAM)
        .args(["--help"])
        .output()
    else {
        return false;
    };
    String::from_utf8_lossy(&output.stdout).contains(GENERATOR)
}

/// Whether the fixture can run, said out loud when it cannot.
pub fn ready() -> bool {
    let ready = available() && offers_generator();
    if !ready {
        eprintln!("skipped: cmake or the {GENERATOR} generator is unavailable");
    }
    ready
}

/// A project with two executables, one library and a target named unlike the project.
pub fn project(tag: &str) -> Option<(TempDir, PathBuf)> {
    if !ready() {
        return None;
    }
    let directory = TempDir::new(tag);
    let root = directory.path().canonicalize().expect("canonical root");
    fs::create_dir_all(root.join("include")).expect("include dir");
    fs::write(
        root.join("include").join("helper.hpp"),
        "#pragma once\nint helper();\n",
    )
    .expect("header");
    fs::write(
        root.join("CMakeLists.txt"),
        "cmake_minimum_required(VERSION 3.20)\n\
         project(demo LANGUAGES C CXX)\n\
         add_library(helper STATIC helper.cpp)\n\
         target_include_directories(helper PUBLIC include)\n\
         add_executable(demo_app main.cpp)\n\
         target_link_libraries(demo_app PRIVATE helper)\n\
         target_include_directories(demo_app PRIVATE include)\n\
         target_compile_definitions(demo_app PRIVATE DEMO_FLAG=1)\n\
         add_executable(tool other.c)\n\
         target_include_directories(tool PRIVATE include)\n\
         target_compile_definitions(tool PRIVATE TOOL_FLAG)\n",
    )
    .expect("manifest");
    fs::write(root.join("helper.cpp"), "int helper() { return 1; }\n").expect("helper");
    fs::write(
        root.join("main.cpp"),
        "int helper();\nint main() { return helper(); }\n",
    )
    .expect("main");
    fs::write(root.join("other.c"), "int main(void) { return 0; }\n").expect("other");
    Some((directory, root))
}

/// Configure the project with the multi-config generator, the way a build does.
pub fn configure(root: &Path, build: &Path) -> bool {
    let argv = vec![
        CMAKE_PROGRAM.to_string(),
        "-S".to_string(),
        root.display().to_string(),
        "-B".to_string(),
        build.display().to_string(),
        "-G".to_string(),
        GENERATOR.to_string(),
    ];
    run_cmake(&BuildState::default(), &argv, &root.display().to_string())
        .map(|outcome| outcome.success)
        .unwrap_or(false)
}

/// The names `cmake --build <dir> --target help` prints, one per build-system target.
pub fn help_targets(build: &Path) -> Vec<String> {
    let Ok(output) = std::process::Command::new(CMAKE_PROGRAM)
        .args(["--build", &build.display().to_string(), "--target", "help"])
        .output()
    else {
        return Vec::new();
    };
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.split(':').next())
        .map(str::trim)
        .filter(|name| !name.is_empty() && !name.contains('/') && !name.contains('['))
        .map(str::to_string)
        .collect()
}
