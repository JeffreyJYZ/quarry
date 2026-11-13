#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod reply_tests {
    use super::*;

    #[test]
    pub fn a_single_target_reply_reads_one_executable_with_its_flags() {
        let directory = single("single-target");

        let model = read_codemodel(directory.path()).expect("the captured reply reads");

        assert_eq!(model.source_root, PathBuf::from("/proj"));
        assert_eq!(model.build_root, PathBuf::from("/proj/build"));
        assert_eq!(model.configurations.len(), 1);
        let configuration = &model.configurations[0];
        assert_eq!(configuration.name, "Debug");
        let target = &configuration.targets[0];
        assert_eq!(target.name, "demo");
        assert!(target.kind.is_executable());
        assert_eq!(
            target.artifacts,
            vec![PathBuf::from("/proj/build/demo")],
            "the artifact is the target's link output, in the recorded build root"
        );
        assert_eq!(target.build_dir, PathBuf::from("/proj/build"));

        let group = &target.groups[0];
        assert_eq!(group.language.as_deref(), Some("CXX"));
        assert_eq!(group.sources, vec![PathBuf::from("/proj/main.cpp")]);
        assert_eq!(
            group.includes,
            vec![IncludePath {
                path: PathBuf::from("/proj/include"),
                system: false,
            }]
        );
        assert_eq!(group.defines, vec!["DEMO_FLAG=1".to_string()]);
        assert_eq!(group.fragments, vec!["-g -arch arm64".to_string()]);
    }

    #[test]
    pub fn objects_are_resolved_by_the_name_the_index_references() {
        let index = r#"{ "objects": [
            { "jsonFile": "not-the-usual-name.json", "kind": "codemodel",
              "version": { "major": 2, "minor": 11 } }
        ] }"#;
        let codemodel = r#"{ "paths": { "build": "/proj/build", "source": "/proj" },
            "configurations": [ { "name": "Debug", "targets": [] } ] }"#;
        let directory = write_reply(
            "index-resolves",
            &[
                ("index-2026-11-13T06-01-10-0935.json", index),
                ("not-the-usual-name.json", codemodel),
            ],
        );

        let objects = read_reply(directory.path())
            .expect("the index reads")
            .objects;
        let object = best_object(&objects, CODEMODEL_KIND).expect("the codemodel object");
        assert_eq!(object.json_file, "not-the-usual-name.json");
        assert_eq!(object.major, 2);
        assert!(object_path(directory.path(), object).is_file());

        let model = read_codemodel(directory.path()).expect("the named file is read");
        assert_eq!(model.configurations[0].name, "Debug");
        assert!(model.configurations[0].targets.is_empty());
    }

    #[test]
    pub fn a_missing_reply_is_an_error_not_an_empty_model() {
        let directory = empty("no-reply");

        let error =
            read_codemodel(directory.path()).expect_err("a tree without a reply has no model");

        assert!(
            error.contains("no CMake file API reply"),
            "the error names the absent reply: {error}"
        );
    }

    #[test]
    pub fn a_reply_naming_a_file_it_does_not_hold_is_an_error() {
        let directory = broken("broken-reply");

        let error = read_codemodel(directory.path()).expect_err("half a reply is not a model");

        assert!(
            error.contains("codemodel-v2-absent00000000000001.json"),
            "the error names the missing object: {error}"
        );
    }

    #[test]
    pub fn malformed_json_is_an_error_naming_the_file() {
        let index = r#"{ "objects": [
            { "jsonFile": "codemodel-v2-bad.json", "kind": "codemodel",
              "version": { "major": 2, "minor": 11 } }
        ] }"#;
        let directory = write_reply(
            "malformed-reply",
            &[
                ("index-2026-11-13T06-01-10-0935.json", index),
                ("codemodel-v2-bad.json", "{ \"configurations\": [ }"),
            ],
        );

        let error = read_codemodel(directory.path()).expect_err("invalid JSON is not a model");

        assert!(error.contains("codemodel-v2-bad.json"), "{error}");
        assert!(error.contains("not valid JSON"), "{error}");
    }

    #[test]
    pub fn a_multi_config_reply_reads_every_configuration_and_target() {
        let directory = multi("multi-config");

        let model = read_codemodel(directory.path()).expect("the multi-config reply reads");
        let reply = read_reply(directory.path()).expect("the index reads");
        assert_eq!(
            reply.generator.as_deref(),
            Some("Ninja Multi-Config"),
            "the generator decides whether a database is CMake's or quarry's"
        );
        assert!(reply.multi_config);

        assert_eq!(
            model
                .configurations
                .iter()
                .map(|configuration| configuration.name.as_str())
                .collect::<Vec<&str>>(),
            vec!["Debug", "Release"]
        );
        let debug = model.configuration("Debug").expect("Debug");
        let release = model.configuration("Release").expect("Release");
        assert_eq!(debug.targets.len(), 3, "three targets in Debug");
        assert_eq!(release.targets.len(), 3, "three targets in Release");

        let debug_demo = &debug.targets[0];
        assert_eq!(debug_demo.name, "demo_app");
        assert_eq!(
            debug_demo.artifacts,
            vec![PathBuf::from("/proj/build/Debug/demo_app")],
            "a multi-config artifact lives under its own configuration"
        );
        assert_eq!(
            &release.targets[0].artifacts,
            &vec![PathBuf::from("/proj/build/Release/demo_app")]
        );
        assert_eq!(
            &debug.targets[0].groups[0].sources,
            &vec![PathBuf::from("/proj/src/main.cpp")],
            "a source resolves against the source root"
        );
        assert_eq!(
            debug.targets[2].groups[0].language.as_deref(),
            Some("C"),
            "a target's group keeps its own language"
        );
    }

    #[test]
    pub fn the_query_is_written_where_cmake_reads_it() {
        let directory = empty("query");

        let path = write_query(directory.path()).expect("the query is written");

        assert_eq!(
            path,
            query_dir(directory.path()).join(QUERY_FILE),
            "the query sits in the client directory CMake polls"
        );
        let text = fs::read_to_string(&path).expect("the query is readable");
        let value: Value = serde_json::from_str(&text).expect("the query is JSON");
        let kinds = value["requests"]
            .as_array()
            .expect("the query carries a requests array")
            .iter()
            .filter_map(|request| request["kind"].as_str())
            .collect::<Vec<&str>>();
        assert_eq!(kinds, vec!["codemodel", "toolchains", "cmakeFiles"]);
        assert_eq!(value["requests"][0]["version"]["major"], 2);
    }
}
