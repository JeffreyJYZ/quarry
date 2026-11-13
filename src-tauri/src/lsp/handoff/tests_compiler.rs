#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

#[cfg(test)]
pub mod tests {
    use super::support::*;
    use super::*;

    /// The one `--query-driver` value a composed argument list carries, if any.
    fn query_driver(args: &[String]) -> Option<String> {
        args.iter()
            .find_map(|arg| arg.strip_prefix(&format!("{QUERY_DRIVER}=")))
            .map(str::to_string)
    }

    /// The variables a compiler record states, in CMake's own shape.
    fn record(cxx: Option<&Path>, cc: Option<&Path>) -> String {
        let mut text = String::new();
        if let Some(cxx) = cxx {
            text.push_str(&format!(
                "set(CMAKE_CXX_COMPILER \"{}\")\nset(CMAKE_CXX_COMPILER_ID \"GNU\")\n",
                cxx.display()
            ));
        }
        if let Some(cc) = cc {
            text.push_str(&format!("set(CMAKE_C_COMPILER \"{}\")\n", cc.display()));
        }
        text
    }

    #[test]
    fn the_compiler_record_names_the_driver_when_the_cache_does_not() {
        let fixture = Fixture::new("record-driver");
        let cxx = fixture.root().join("toolchain/g++");
        let cc = fixture.root().join("toolchain/gcc");
        fixture.write("toolchain/g++", "");
        fixture.write("toolchain/gcc", "");
        fixture.write(
            "build/CMakeFiles/3.31.6/CMakeCXXCompiler.cmake",
            &record(Some(&cxx), None),
        );
        fixture.write(
            "build/CMakeFiles/3.31.6/CMakeCCompiler.cmake",
            &record(None, Some(&cc)),
        );
        fixture.write("build/CMakeCache.txt", "");
        fixture.write("build/compile_commands.json", "[]");

        let computed = clangd_args(&[], Some(&fixture.root().join("build")));

        assert_eq!(
            query_driver(&computed),
            Some(format!("{},{}", cxx.display(), cc.display())),
            "a toolchain-selected compiler is recorded in CMakeFiles, not in the cache: {computed:?}"
        );
    }

    #[test]
    fn the_record_answers_over_the_cache_and_the_database() {
        let fixture = Fixture::new("record-authority");
        let recorded = fixture.root().join("toolchain/recorded-g++");
        let cached = fixture.root().join("toolchain/cached-g++");
        let compiled = fixture.root().join("toolchain/compiled-g++");
        fixture.write("toolchain/recorded-g++", "");
        fixture.write("toolchain/cached-g++", "");
        fixture.write("toolchain/compiled-g++", "");
        fixture.write(
            "build/CMakeFiles/4.0.0/CMakeCXXCompiler.cmake",
            &record(Some(&recorded), None),
        );
        fixture.write(
            "build/CMakeCache.txt",
            &format!("CMAKE_CXX_COMPILER:FILEPATH={}\n", cached.display()),
        );
        fixture.write(
            "build/compile_commands.json",
            &format!(
                r#"[{{"directory": "{root}", "arguments": ["{compiled}", "-c", "a.cpp"]}}]"#,
                root = fixture.root().display(),
                compiled = compiled.display()
            ),
        );

        let computed = clangd_args(&[], Some(&fixture.root().join("build")));

        assert_eq!(
            query_driver(&computed),
            Some(recorded.display().to_string()),
            "CMake's own compiler record is the sharpest answer: {computed:?}"
        );
    }

    #[test]
    fn a_record_naming_a_launcher_is_resolved_through_the_commands_behind_it() {
        let fixture = Fixture::new("record-launcher");
        let launcher = fixture.root().join("toolchain/wrap.sh");
        let compiler = fixture.root().join("toolchain/g++");
        fixture.write("toolchain/wrap.sh", "#!/bin/sh\nexec \"$@\"\n");
        fixture.write("toolchain/g++", "");
        fixture.write(
            "build/CMakeFiles/3.31.6/CMakeCXXCompiler.cmake",
            &record(Some(&launcher), None),
        );
        fixture.write("build/CMakeCache.txt", "");
        fixture.write(
            "build/compile_commands.json",
            &format!(
                r#"[{{"directory": "{root}", "arguments": ["{launcher}", "{compiler}", "-c", "a.cpp"]}}]"#,
                root = fixture.root().display(),
                launcher = launcher.display(),
                compiler = compiler.display()
            ),
        );

        let computed = clangd_args(&[], Some(&fixture.root().join("build")));

        assert_eq!(
            query_driver(&computed),
            Some(compiler.display().to_string()),
            "the driver behind the launcher is the one clangd can query: {computed:?}"
        );
    }

    #[test]
    fn a_launcher_is_never_the_query_driver() {
        let fixture = Fixture::new("record-launcher-only");
        let launcher = fixture.root().join("toolchain/ccache-standin");
        fixture.write("toolchain/ccache-standin", "#!/bin/sh\nexec \"$@\"\n");
        fixture.write(
            "build/CMakeFiles/3.31.6/CMakeCXXCompiler.cmake",
            &record(Some(&launcher), None),
        );
        fixture.write("build/CMakeCache.txt", "");
        fixture.write("build/compile_commands.json", "[]");

        let computed = clangd_args(&[], Some(&fixture.root().join("build")));

        assert_eq!(
            query_driver(&computed),
            None,
            "a launcher answers --version for itself, which teaches clangd nothing: {computed:?}"
        );
    }
}
