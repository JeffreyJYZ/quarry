#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

#[cfg(test)]
pub mod multi_config_tests {
    use std::process::Command;

    use crate::build_task::{
        BuildProfile, CMAKE_PROGRAM, CompileEntry, DATABASE_FILE, write_query,
    };
    use crate::test_support::TempDir;

    use super::support::cmake_available;
    use super::*;

    const CMAKE_LISTS: &str = "cmake_minimum_required(VERSION 3.20)\n\
         project(parity_multi CXX)\n\
         add_executable(parity_multi main.cpp)\n";

    /// A project configured by `Ninja Multi-Config`, holding only the configurations given.
    ///
    /// The generator is the one a CLion user has when the profile and the artefacts come apart: it
    /// writes no database of its own, so the file clangd reads is the one quarry synthesises.
    fn configured(configurations: &str) -> Option<(TempDir, ProjectInfo)> {
        if !cmake_available() {
            return None;
        }
        let program = crate::resolve::resolve(CMAKE_PROGRAM)?.path;
        let known = Command::new(&program)
            .arg("--help")
            .output()
            .is_ok_and(|out| String::from_utf8_lossy(&out.stdout).contains("Ninja Multi-Config"));
        if !known || crate::resolve::resolve("ninja").is_none() {
            return None;
        }
        let directory = TempDir::new("handoff-multi-config");
        let root = directory.path().canonicalize().ok()?;
        fs::write(root.join("CMakeLists.txt"), CMAKE_LISTS).ok()?;
        fs::write(root.join("main.cpp"), "int main() { return 0; }\n").ok()?;
        let build = root.join("build").display().to_string();
        // The query the product writes before its own configure, so this tree answers the same way
        // one quarry configured does instead of being re-configured on the first session.
        write_query(Path::new(&build)).ok()?;
        let configured = Command::new(&program)
            .args(["-S", &root.display().to_string(), "-B", &build])
            .args([
                "-G",
                "Ninja Multi-Config",
                "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON",
            ])
            .arg(format!("-DCMAKE_CONFIGURATION_TYPES={configurations}"))
            .output()
            .ok()?;
        if !configured.status.success() {
            return None;
        }
        let path = root.display().to_string();
        let info = ProjectInfo {
            root: path.clone(),
            opened_root: path.clone(),
            name: "parity_multi".to_string(),
            kind: ProjectKind::Cmake,
            build_root: path,
            launch_config: None,
        };
        Some((directory, info))
    }

    fn entries(info: &ProjectInfo) -> Vec<CompileEntry> {
        let database = Path::new(&info.root).join("build").join(DATABASE_FILE);
        let text = fs::read_to_string(&database).expect("the synthesised database");
        serde_json::from_str(&text).expect("a JSON array of entries")
    }

    #[test]
    fn switching_profile_rewrites_the_database_for_the_new_configuration() {
        let Some((_directory, info)) = configured("Debug;Release") else {
            return;
        };
        let build = Path::new(&info.root).join("build");

        let release = crate::lsp::server_args("clangd", &info, &[], BuildProfile::Release);
        assert_eq!(release.database, Some(build.clone()));
        assert!(
            release
                .note
                .as_deref()
                .is_some_and(|note| note.contains("Release")),
            "the first write says which configuration it describes: {:?}",
            release.note
        );
        let written = entries(&info);
        assert_eq!(written.len(), 1, "one entry per source: {written:?}");
        assert!(
            !written[0].arguments.contains(&"-g".to_string()),
            "Release's command has no debug info: {:?}",
            written[0].arguments
        );

        let debug = crate::lsp::server_args("clangd", &info, &[], BuildProfile::Debug);
        assert!(
            debug
                .note
                .as_deref()
                .is_some_and(|note| note.contains("Debug")),
            "the switch rewrites the file, and says so: {:?}",
            debug.note
        );
        let written = entries(&info);
        assert_eq!(
            written.len(),
            1,
            "the previous configuration is not left beside it"
        );
        assert!(
            written[0].arguments.contains(&"-g".to_string()),
            "Debug's command is the one written: {:?}",
            written[0].arguments
        );

        // The same configuration twice is one write: the chosen configuration is part of "current".
        crate::lsp::server_args("clangd", &info, &[], BuildProfile::Release);
        let again = crate::lsp::server_args("clangd", &info, &[], BuildProfile::Release);
        assert_eq!(
            again.note, None,
            "an unchanged configuration is not reported"
        );
    }

    #[test]
    fn a_profile_the_tree_was_not_configured_for_starts_without_a_database() {
        let Some((_directory, info)) = configured("Debug") else {
            return;
        };

        let release = crate::lsp::server_args("clangd", &info, &[], BuildProfile::Release);

        assert_eq!(
            release.database, None,
            "Debug's flags are never passed off as Release's: {:?}",
            release.args
        );
        let note = release.note.unwrap_or_default();
        assert!(
            note.contains("Release") && note.contains("Debug"),
            "it names the configuration it could not find, and what it found instead: {note}"
        );
        assert!(
            !release
                .args
                .iter()
                .any(|arg| arg.starts_with(COMPILE_COMMANDS_DIR)),
            "clangd is not pointed at another configuration's database: {:?}",
            release.args
        );
    }
}
