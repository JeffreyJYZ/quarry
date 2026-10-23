#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::ProjectInfo;
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[tauri::command]
pub fn create_project(
    parent: String,
    name: String,
    kind: String,
    standard: String,
) -> Result<ProjectInfo, String> {
    let trimmed_name = name.trim().to_string();
    if trimmed_name.is_empty() {
        return Err("the project name is empty.".to_string());
    }
    if trimmed_name.contains('/') || trimmed_name.contains('\\') {
        return Err(format!(
            "the project name must be a single path segment: {trimmed_name}"
        ));
    }
    if trimmed_name == ".." {
        return Err(format!(
            "the project name must be a single path segment: {trimmed_name}"
        ));
    }
    if trimmed_name.chars().all(|c| c == '.' || c.is_whitespace()) {
        return Err(format!(
            "the project name must not be only dots or whitespace: {trimmed_name}"
        ));
    }

    let parent_path = Path::new(parent.trim());
    if !parent_path.is_absolute() {
        return Err(format!("parent must be an absolute path: {parent}"));
    }
    if !parent_path.is_dir() {
        return Err(format!("parent directory does not exist: {parent}"));
    }

    let target: PathBuf = parent_path.join(&trimmed_name);
    if target.exists() {
        return Err(format!(
            "target directory already exists: {}",
            target.display()
        ));
    }

    match kind.as_str() {
        "rust-bin" | "rust-lib" | "c-cmake" | "cpp-cmake" => {}
        _ => {
            return Err(format!(
                "unknown project kind \"{kind}\"; accepted values: rust-bin, rust-lib, c-cmake, cpp-cmake."
            ));
        }
    }

    // An empty standard means "the kind's default"; anything else has to belong to the language.
    let standard = resolve_standard(&kind, standard.trim())?;

    fs::create_dir(&target)
        .map_err(|error| format!("cannot create {}: {error}", target.display()))?;

    match kind.as_str() {
        "rust-bin" => {
            write_file(
                &target,
                "Cargo.toml",
                &rust_cargo_toml(&trimmed_name, &standard),
            )?;
            fs::create_dir_all(target.join("src"))
                .map_err(|e| format!("cannot create src: {e}"))?;
            write_file(
                &target,
                "src/main.rs",
                &format!("fn main() {{\n    println!(\"Hello from {trimmed_name}\");\n}}\n"),
            )?;
            write_file(&target, ".gitignore", "/target\n")?;
        }
        "rust-lib" => {
            write_file(
                &target,
                "Cargo.toml",
                &rust_cargo_toml(&trimmed_name, &standard),
            )?;
            fs::create_dir_all(target.join("src"))
                .map_err(|e| format!("cannot create src: {e}"))?;
            write_file(
                &target,
                "src/lib.rs",
                "pub fn add(a: usize, b: usize) -> usize {\n    a + b\n}\n\n#[cfg(test)]\nmod tests {\n    use super::*;\n\n    #[test]\n    fn it_works() {\n        assert_eq!(add(2, 2), 4);\n    }\n}\n",
            )?;
            write_file(&target, ".gitignore", "/target\n")?;
        }
        "c-cmake" => {
            write_file(
                &target,
                "CMakeLists.txt",
                &c_cmake_lists(&trimmed_name, &standard),
            )?;
            fs::create_dir_all(target.join("src"))
                .map_err(|e| format!("cannot create src: {e}"))?;
            write_file(
                &target,
                "src/main.c",
                &format!(
                    "#include <stdio.h>\n\nint main(void) {{\n    printf(\"Hello from {trimmed_name}\\n\");\n    return 0;\n}}\n"
                ),
            )?;
            write_file(&target, ".gitignore", "/build\n")?;
        }
        "cpp-cmake" => {
            write_file(
                &target,
                "CMakeLists.txt",
                &cpp_cmake_lists(&trimmed_name, &standard),
            )?;
            fs::create_dir_all(target.join("src"))
                .map_err(|e| format!("cannot create src: {e}"))?;
            write_file(
                &target,
                "src/main.cpp",
                &format!(
                    "#include <iostream>\n\nint main() {{\n    std::cout << \"Hello from {trimmed_name}\" << std::endl;\n    return 0;\n}}\n"
                ),
            )?;
            write_file(&target, ".gitignore", "/build\n")?;
        }
        _ => unreachable!(),
    }

    project::open_project(target.to_string_lossy().into_owned())
}

pub fn write_file(root: &Path, rel: &str, contents: &str) -> Result<(), String> {
    let path = root.join(rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
    }
    fs::write(&path, contents).map_err(|e| format!("cannot write {}: {e}", path.display()))
}

pub const RUST_EDITIONS: [&str; 2] = ["2021", "2024"];

pub const C_STANDARDS: [&str; 3] = ["11", "17", "23"];

pub const CPP_STANDARDS: [&str; 3] = ["17", "20", "23"];
