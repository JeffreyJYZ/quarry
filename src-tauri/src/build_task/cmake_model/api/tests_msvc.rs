#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

pub use serde_json::Value;

use super::*;

/// A synthesised command line for MSVC, which is what a Visual Studio tree analysed with.
///
/// The generator writes no `compile_commands.json`, so this entry is the only command line clangd
/// ever sees; spelling it with clang's flags described a compiler the tree was not built with.
#[cfg(test)]
#[allow(dead_code)]
pub mod msvc_tests {
    use super::*;

    const CL: &str = "C:/Program Files/Microsoft Visual Studio/2022/Enterprise/VC/Tools/MSVC/bin/Hostx64/x64/cl.exe";

    fn toolchains(path: &str) -> Value {
        serde_json::json!({
            "kind": "toolchains",
            "version": { "major": 1, "minor": 0 },
            "toolchains": [
                { "language": "C", "compiler": { "path": path, "id": "MSVC" } },
                { "language": "CXX", "compiler": { "path": path, "id": "MSVC" } }
            ]
        })
    }

    fn project(driver: &str) -> CompileEntry {
        let compilers = Compilers::parse(&toolchains(driver));
        let target = Target {
            name: "parity_vs".to_string(),
            kind: TargetKind::Executable,
            configuration: "Debug".to_string(),
            build_dir: PathBuf::from("/proj/build/parity_vs.dir/Debug"),
            artifacts: vec![PathBuf::from("/proj/build/Debug/parity_vs.exe")],
            groups: Vec::new(),
        };
        let group = CompileGroup {
            language: Some("CXX".to_string()),
            includes: vec![IncludePath {
                path: PathBuf::from("/proj/include"),
                system: false,
            }],
            defines: vec!["WIN32".to_string()],
            fragments: vec!["/O2".to_string()],
            sources: Vec::new(),
        };
        compile_entry(&target, &group, Path::new("/proj/main.cpp"), &compilers)
    }

    #[test]
    pub fn a_visual_studio_entry_spells_its_flags_the_way_cl_does() {
        let entry = project(CL);

        assert_eq!(entry.arguments.first().map(String::as_str), Some(CL));
        for expected in [
            &"/O2".to_string(),
            &"/I".to_string(),
            &"/DWIN32".to_string(),
        ] {
            assert!(
                entry.arguments.contains(expected),
                "the entry carries {expected}: {:?}",
                entry.arguments
            );
        }
        assert!(
            entry.arguments.contains(&"/proj/include".to_string()),
            "the project include follows /I: {:?}",
            entry.arguments
        );
        assert_eq!(
            entry.arguments[entry.arguments.len() - 2..].to_vec(),
            vec!["/c".to_string(), "/proj/main.cpp".to_string()],
            "cl compiles one file with /c, never -c"
        );
    }

    #[test]
    pub fn a_system_include_is_external_and_a_clang_entry_still_uses_dashes() {
        let compilers = Compilers::parse(&toolchains(CL));
        let target = Target {
            name: "parity_vs".to_string(),
            kind: TargetKind::Executable,
            configuration: "Debug".to_string(),
            build_dir: PathBuf::from("/proj/build"),
            artifacts: Vec::new(),
            groups: Vec::new(),
        };
        let group = CompileGroup {
            language: Some("CXX".to_string()),
            includes: vec![IncludePath {
                path: PathBuf::from("/sdk/include"),
                system: true,
            }],
            defines: Vec::new(),
            fragments: Vec::new(),
            sources: Vec::new(),
        };
        let msvc = compile_entry(&target, &group, Path::new("/proj/main.cpp"), &compilers);
        assert!(msvc.arguments.contains(&"/external:I".to_string()));

        let gnu = Compilers::parse(&toolchains("/usr/bin/clang++"));
        let entry = compile_entry(&target, &group, Path::new("/proj/main.cpp"), &gnu);
        assert_eq!(
            entry.arguments.first().map(String::as_str),
            Some("/usr/bin/clang++")
        );
        assert!(entry.arguments.contains(&"-isystem".to_string()));
        assert!(entry.arguments.contains(&"-c".to_string()));
    }

    #[test]
    pub fn the_style_is_the_drivers_own_and_an_exe_suffix_is_not_its_name() {
        assert_eq!(driver_style(CL), DriverStyle::Msvc);
        assert_eq!(driver_style("cl.exe"), DriverStyle::Msvc);
        assert_eq!(driver_style("clang-cl.exe"), DriverStyle::Msvc);
        assert_eq!(driver_style("/usr/bin/clang++"), DriverStyle::Gnu);
        assert_eq!(driver_style("/opt/homebrew/bin/g++-16"), DriverStyle::Gnu);
        assert_eq!(driver_style("cc"), DriverStyle::Gnu);
    }
}
