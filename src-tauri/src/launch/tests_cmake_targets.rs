#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// Run targets read from a CMake file API reply, which is the model a real configure writes.
#[cfg(test)]
#[allow(dead_code)]
pub mod cmake_targets_tests {
    use super::*;
    use crate::test_support::TempDir;
    use serde_json::{Value, json};

    fn info(root: &Path, name: &str, kind: ProjectKind) -> ProjectInfo {
        ProjectInfo {
            root: root.display().to_string(),
            opened_root: root.display().to_string(),
            name: name.to_string(),
            kind,
            build_root: root.display().to_string(),
            launch_config: None,
        }
    }

    /// A project root that is already configured, holding a reply for `targets`.
    ///
    /// Each target is `(name, CMake type, artifact relative to the build root)`, and the reply is
    /// written under the root itself so the detected build root is the directory under test.
    fn configured(tag: &str, targets: &[(&str, &str, &str)]) -> TempDir {
        let directory = TempDir::new(tag);
        let root = directory.path().canonicalize().expect("canonical root");
        fs::write(root.join("CMakeLists.txt"), "project(demo)\n").expect("manifest");
        fs::write(root.join("CMakeCache.txt"), "").expect("configured marker");
        let reply = root.join(".cmake").join("api").join("v1").join("reply");
        fs::create_dir_all(&reply).expect("reply directory");

        let mut entries = Vec::new();
        for (index, (name, kind, artifact)) in targets.iter().enumerate() {
            let file = format!("target-{name}-Debug-{index}.json");
            let body = json!({
                "name": name,
                "type": kind,
                "paths": { "build": ".", "source": "." },
                "artifacts": [{ "path": artifact }],
                "compileGroups": [],
                "sources": []
            });
            fs::write(reply.join(&file), body.to_string()).expect("target file");
            entries.push(json!({
                "jsonFile": file,
                "name": name,
                "directoryIndex": 0,
                "projectIndex": 0
            }));
        }
        let codemodel = json!({
            "kind": "codemodel",
            "paths": { "build": root, "source": root },
            "configurations": [{ "name": "Debug", "targets": Value::Array(entries) }]
        });
        fs::write(reply.join("codemodel-v2-test.json"), codemodel.to_string()).expect("codemodel");
        let index = json!({ "objects": [
            { "kind": "codemodel", "version": { "major": 2 }, "jsonFile": "codemodel-v2-test.json" }
        ] });
        fs::write(
            reply.join("index-2026-11-13T06-01-10-0935.json"),
            index.to_string(),
        )
        .expect("index");
        directory
    }

    #[test]
    pub fn every_target_the_project_defines_is_offered_with_its_own_artifact() {
        let directory = configured(
            "launch-cmake-targets",
            &[
                ("demo_app", "EXECUTABLE", "Debug/demo_app"),
                ("helper", "STATIC_LIBRARY", "Debug/libhelper.a"),
                ("tool", "EXECUTABLE", "Debug/tool"),
            ],
        );
        let root = directory.path().canonicalize().expect("canonical root");
        let info = info(&root, "demo", ProjectKind::Cmake);

        let executables = cpp_executables(&info);

        assert_eq!(
            executables,
            vec![
                ("demo_app".to_string(), root.join("Debug/demo_app")),
                ("tool".to_string(), root.join("Debug/tool")),
            ],
            "both executables, and no library, whatever the project is called"
        );
        let targets = list_cpp_targets(&info);
        assert_eq!(
            targets
                .iter()
                .map(|target| target.id.as_str())
                .collect::<Vec<&str>>(),
            vec!["cpp:demo_app", "cpp:tool"]
        );
    }

    #[test]
    pub fn a_named_target_resolves_to_the_artifact_cmake_names() {
        let directory = configured(
            "launch-cmake-resolve",
            &[("demo_app", "EXECUTABLE", "Debug/demo_app")],
        );
        let root = directory.path().canonicalize().expect("canonical root");
        let info = info(&root, "demo", ProjectKind::Cmake);

        let config = resolve_cpp(&info, "demo_app", true).expect("the target resolves");

        assert_eq!(Path::new(&config.program), root.join("Debug/demo_app"));
        assert!(config.stop_on_entry);
    }

    #[test]
    pub fn a_reply_with_only_libraries_falls_back_to_the_name_search() {
        let directory = configured(
            "launch-cmake-library-only",
            &[("helper", "STATIC_LIBRARY", "Debug/libhelper.a")],
        );
        let root = directory.path().canonicalize().expect("canonical root");
        let info = info(&root, "demo", ProjectKind::Cmake);

        let executables = cpp_executables(&info);

        assert_eq!(
            executables,
            vec![("demo".to_string(), root.join("demo"))],
            "a project with no executable target answers as it did before the model"
        );
    }

    #[test]
    pub fn a_project_with_no_reply_still_names_the_program_its_build_writes() {
        let directory = TempDir::new("launch-cmake-no-reply");
        let root = directory.path().canonicalize().expect("canonical root");
        fs::write(
            root.join("CMakeLists.txt"),
            "project(demo)\nadd_executable(app main.cpp)\n",
        )
        .expect("manifest");
        let info = info(&root, "demo", ProjectKind::Cmake);

        let executables = cpp_executables(&info);

        assert_eq!(
            executables,
            vec![("app".to_string(), root.join("build").join("app"))],
            "the manifest's target and the conventional build tree, as before"
        );
    }
}
