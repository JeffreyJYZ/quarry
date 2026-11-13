#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

/// The Windows half of the hand-off: a tree built by MSVC, whose driver clangd only queries when
/// the hand-off names it.
///
/// The record is real CMake shape, and the fixture writes a file whose *name* is `cl.exe` for the
/// same reason the product filters launchers out: the filter is a file-name decision, and a file
/// with that name on any platform exercises it without a Windows machine.
#[cfg(test)]
pub mod msvc_tests {
    use super::support::*;
    use super::*;

    /// The one `--query-driver` value a composed argument list carries, if any.
    fn query_driver(args: &[String]) -> Option<String> {
        args.iter()
            .find_map(|arg| arg.strip_prefix(&format!("{QUERY_DRIVER}=")))
            .map(str::to_string)
    }

    #[test]
    fn a_visual_studio_record_names_cl_as_the_driver_to_query() {
        let fixture = Fixture::new("record-msvc");
        let cl = fixture.root().join("toolchain/cl.exe");
        fixture.write("toolchain/cl.exe", "");
        fixture.write(
            "build/CMakeFiles/3.31.6/CMakeCXXCompiler.cmake",
            &format!(
                "set(CMAKE_CXX_COMPILER \"{}\")\nset(CMAKE_CXX_COMPILER_ID \"MSVC\")\n",
                cl.display()
            ),
        );
        fixture.write("build/CMakeCache.txt", "");
        fixture.write("build/compile_commands.json", "[]");

        let computed = clangd_args(&[], Some(&fixture.root().join("build")));

        assert_eq!(
            query_driver(&computed),
            Some(cl.display().to_string()),
            "cl.exe is the compiler this tree was built with, so clangd must query it: {computed:?}"
        );
    }

    #[test]
    fn a_visual_studio_database_names_cl_when_the_records_are_missing() {
        let fixture = Fixture::new("database-msvc");
        let cl = fixture.root().join("toolchain/cl.exe");
        fixture.write("toolchain/cl.exe", "");
        fixture.write(
            "build/compile_commands.json",
            &format!(
                r#"[{{"directory": "{root}", "file": "{root}/main.cpp", "arguments": ["{cl}", "/I", "{root}/include", "/c", "{root}/main.cpp"]}}]"#,
                root = fixture.root().display(),
                cl = cl.display()
            ),
        );

        let computed = clangd_args(&[], Some(&fixture.root().join("build")));

        assert_eq!(
            query_driver(&computed),
            Some(cl.display().to_string()),
            "a tree written by something other than CMake has only its database: {computed:?}"
        );
    }
}
