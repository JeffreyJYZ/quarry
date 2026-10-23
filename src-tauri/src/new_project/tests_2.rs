#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::ProjectInfo;
pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_2 {
    use super::*;

    pub fn scratch(label: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("quarry-new-project-{}-{label}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("creates the scratch directory");
        dir
    }

    pub fn create(parent: &Path, name: &str, kind: &str) -> Result<ProjectInfo, String> {
        create_with(parent, name, kind, "")
    }

    pub fn create_with(
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
    pub fn the_language_standard_reaches_the_generated_manifest() {
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
    pub fn an_empty_standard_falls_back_to_the_default() {
        assert_eq!(resolve_standard("rust-bin", ""), Ok("2024".to_string()));
        assert_eq!(resolve_standard("c-cmake", ""), Ok("17".to_string()));
        assert_eq!(resolve_standard("cpp-cmake", ""), Ok("20".to_string()));
    }

    #[test]
    pub fn a_standard_from_the_wrong_language_is_refused() {
        let error = resolve_standard("c-cmake", "20").unwrap_err();
        assert!(error.contains("not available"), "{error}");
        assert!(error.contains("11, 17, 23"), "{error}");
    }
}
