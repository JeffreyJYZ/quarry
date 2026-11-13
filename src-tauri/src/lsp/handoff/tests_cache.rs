#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

#[cfg(test)]
pub mod tests {
    use super::support::*;
    use super::*;

    #[test]
    fn the_cache_names_the_driver_to_query() {
        let fixture = Fixture::new("cache-driver");
        let compiler = fixture.root().join("toolchain/g++");
        fixture.write("toolchain/g++", "");
        fixture.write(
            "build/CMakeCache.txt",
            &format!("CMAKE_CXX_COMPILER:FILEPATH={}\n", compiler.display()),
        );
        fixture.write("build/compile_commands.json", "[]");

        let computed = clangd_args(&[], Some(&fixture.root().join("build")));

        let driver = computed
            .iter()
            .find(|arg| arg.starts_with(QUERY_DRIVER))
            .expect("a query-driver flag");
        assert_eq!(driver, &format!("{QUERY_DRIVER}={}", compiler.display()));
    }

    #[test]
    fn a_cache_naming_no_existing_compiler_falls_back_to_the_database() {
        let fixture = Fixture::new("cache-missing");
        let compiler = fixture.root().join("toolchain/clang++");
        fixture.write("toolchain/clang++", "");
        fixture.write(
            "build/CMakeCache.txt",
            "CMAKE_CXX_COMPILER:FILEPATH=/nowhere/clang++\n",
        );
        fixture.write(
            "build/compile_commands.json",
            &format!(
                r#"[{{"directory": "{root}", "file": "{root}/a.cpp", "arguments": ["{compiler}", "-c", "a.cpp"]}}]"#,
                root = fixture.root().display(),
                compiler = compiler.display()
            ),
        );

        let computed = clangd_args(&[], Some(&fixture.root().join("build")));

        let driver = computed
            .iter()
            .find(|arg| arg.starts_with(QUERY_DRIVER))
            .expect("a query-driver flag");
        assert_eq!(driver, &format!("{QUERY_DRIVER}={}", compiler.display()));
    }
}
