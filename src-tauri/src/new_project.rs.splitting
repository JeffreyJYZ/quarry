//! Scaffolding for a new project directory.
//!
//! Creates the directory and a handful of starter files for one of the supported kinds. No network
//! and no subprocess: everything is written directly.

use crate::project;
use crate::types::ProjectInfo;
use std::fs;
use std::path::{Path, PathBuf};

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

fn write_file(root: &Path, rel: &str, contents: &str) -> Result<(), String> {
    let path = root.join(rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
    }
    fs::write(&path, contents).map_err(|e| format!("cannot write {}: {e}", path.display()))
}

const RUST_EDITIONS: [&str; 2] = ["2021", "2024"];
const C_STANDARDS: [&str; 3] = ["11", "17", "23"];
const CPP_STANDARDS: [&str; 3] = ["17", "20", "23"];

/// The standard a kind accepts, or its default when the caller passed nothing.
///
/// A C++ standard offered to a C project is a mistake worth naming rather than silently rewriting,
/// so an unknown value is an error, never a fallback.
fn resolve_standard(kind: &str, requested: &str) -> Result<String, String> {
    let (allowed, default): (&[&str], &str) = match kind {
        "rust-bin" | "rust-lib" => (&RUST_EDITIONS, "2024"),
        "c-cmake" => (&C_STANDARDS, "17"),
        "cpp-cmake" => (&CPP_STANDARDS, "20"),
        _ => return Ok(String::new()),
    };
    if requested.is_empty() {
        return Ok(default.to_string());
    }
    if allowed.contains(&requested) {
        return Ok(requested.to_string());
    }
    Err(format!(
        "standard \"{requested}\" is not available for {kind}; accepted values: {}",
        allowed.join(", ")
    ))
}

fn rust_cargo_toml(name: &str, edition: &str) -> String {
    format!(
        "[package]\nname = \"{name}\"\nversion = \"0.1.0\"\nedition = \"{edition}\"\n\n[dependencies]\n"
    )
}

fn cpp_cmake_lists(name: &str, standard: &str) -> String {
    format!(
        "cmake_minimum_required(VERSION 3.20)\nproject({name} CXX)\n\nset(CMAKE_CXX_STANDARD {standard})\nset(CMAKE_CXX_STANDARD_REQUIRED ON)\n\nadd_executable({name} src/main.cpp)\n"
    )
}

fn c_cmake_lists(name: &str, standard: &str) -> String {
    format!(
        "cmake_minimum_required(VERSION 3.20)\nproject({name} C)\n\nset(CMAKE_C_STANDARD {standard})\nset(CMAKE_C_STANDARD_REQUIRED ON)\n\nadd_executable({name} src/main.c)\n"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(label: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("quarry-new-project-{}-{label}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("creates the scratch directory");
        dir
    }

    fn create(parent: &Path, name: &str, kind: &str) -> Result<ProjectInfo, String> {
        create_with(parent, name, kind, "")
    }

    fn create_with(
        parent: &Path,
        name: &str,
        kind: &str,
        standard: &str,
    ) -> Result<ProjectInfo, String> {
        create_project(
            parent.display().to_string(),
            name.to_string(),
            kind.to_string(),
            standard.to_string(),
        )
    }

    #[test]
    fn every_kind_writes_its_files_and_is_detected() {
        let cases = [
            ("rust-bin", "src/main.rs", crate::types::ProjectKind::Cargo),
            ("rust-lib", "src/lib.rs", crate::types::ProjectKind::Cargo),
            ("c-cmake", "src/main.c", crate::types::ProjectKind::Cmake),
            (
                "cpp-cmake",
                "src/main.cpp",
                crate::types::ProjectKind::Cmake,
            ),
        ];
        for (kind, entry, expected) in cases {
            let parent = scratch(kind);
            let info = create(&parent, "demo", kind).expect("creates the project");
            assert_eq!(info.name, "demo", "{kind} name");
            assert!(
                Path::new(&info.root).join(entry).is_file(),
                "{kind} did not write {entry}"
            );
            assert_eq!(info.kind, expected, "{kind} detected as the wrong kind");
            if kind.ends_with("cmake") {
                let manifest = fs::read_to_string(Path::new(&info.root).join("CMakeLists.txt"))
                    .expect("reads");
                let language = if kind == "c-cmake" { "C" } else { "CXX" };
                assert!(
                    manifest.contains(&format!("project(demo {language})")),
                    "{kind} manifest: {manifest}"
                );
            }
            let _ = fs::remove_dir_all(&parent);
        }
    }

    #[test]
    fn the_c_scaffold_is_plain_c() {
        let parent = scratch("c-contents");
        let info = create(&parent, "capp", "c-cmake").expect("creates the project");
        let source = fs::read_to_string(Path::new(&info.root).join("src/main.c")).expect("reads");
        assert!(source.contains("#include <stdio.h>"), "{source}");
        assert!(source.contains("int main(void)"), "{source}");
        assert!(
            !source.contains("iostream"),
            "C scaffold leaked C++: {source}"
        );
        let _ = fs::remove_dir_all(&parent);
    }

    #[test]
    fn a_library_scaffold_carries_a_passing_test() {
        let parent = scratch("lib-contents");
        let info = create(&parent, "demo", "rust-lib").expect("creates the project");
        let source = fs::read_to_string(Path::new(&info.root).join("src/lib.rs")).expect("reads");
        assert!(source.contains("#[test]"), "{source}");
        let _ = fs::remove_dir_all(&parent);
    }

    #[test]
    fn bad_names_and_targets_are_refused() {
        let parent = scratch("refusals");
        assert!(
            create(&parent, "  ", "rust-bin")
                .unwrap_err()
                .contains("empty")
        );
        assert!(
            create(&parent, "a/b", "rust-bin")
                .unwrap_err()
                .contains("single path segment")
        );
        assert!(
            create(&parent, "..", "rust-bin")
                .unwrap_err()
                .contains("single path segment")
        );

        fs::create_dir_all(parent.join("taken")).expect("creates the taken directory");
        assert!(
            create(&parent, "taken", "rust-bin")
                .unwrap_err()
                .contains("already exists")
        );

        assert!(
            create(&parent, "demo", "kotlin")
                .unwrap_err()
                .contains("accepted values")
        );
        let _ = fs::remove_dir_all(&parent);
    }

    #[test]
    fn a_relative_parent_is_refused() {
        let error = create_project(
            "relative/dir".to_string(),
            "demo".to_string(),
            "rust-bin".to_string(),
            String::new(),
        )
        .unwrap_err();
        assert!(error.contains("absolute"), "{error}");
    }

    #[test]
    fn the_language_standard_reaches_the_generated_manifest() {
        let parent = scratch("standards");
        let rust = create_with(&parent, "r", "rust-bin", "2021").expect("creates rust");
        let manifest = fs::read_to_string(Path::new(&rust.root).join("Cargo.toml")).expect("reads");
        assert!(manifest.contains("edition = \"2021\""), "{manifest}");

        let cpp = create_with(&parent, "cpp", "cpp-cmake", "23").expect("creates c++");
        let cmake = fs::read_to_string(Path::new(&cpp.root).join("CMakeLists.txt")).expect("reads");
        assert!(cmake.contains("CMAKE_CXX_STANDARD 23"), "{cmake}");

        let c = create_with(&parent, "c", "c-cmake", "11").expect("creates c");
        let cmake = fs::read_to_string(Path::new(&c.root).join("CMakeLists.txt")).expect("reads");
        assert!(cmake.contains("CMAKE_C_STANDARD 11"), "{cmake}");

        let _ = fs::remove_dir_all(&parent);
    }

    #[test]
    fn an_empty_standard_falls_back_to_the_default() {
        assert_eq!(resolve_standard("rust-bin", ""), Ok("2024".to_string()));
        assert_eq!(resolve_standard("c-cmake", ""), Ok("17".to_string()));
        assert_eq!(resolve_standard("cpp-cmake", ""), Ok("20".to_string()));
    }

    #[test]
    fn a_standard_from_the_wrong_language_is_refused() {
        let error = resolve_standard("c-cmake", "20").unwrap_err();
        assert!(error.contains("not available"), "{error}");
        assert!(error.contains("11, 17, 23"), "{error}");
    }
}
