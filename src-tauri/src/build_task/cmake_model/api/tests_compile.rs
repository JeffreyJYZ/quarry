#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod compile_tests {
    use super::*;

    fn read_database(root: &Path) -> Vec<CompileEntry> {
        let text = fs::read_to_string(root.join(DATABASE_FILE)).expect("the database is written");
        serde_json::from_str(&text).expect("the database is a JSON array of entries")
    }

    fn find<'a>(entries: &'a [CompileEntry], file: &str) -> &'a CompileEntry {
        entries
            .iter()
            .find(|entry| entry.file == file)
            .unwrap_or_else(|| panic!("no entry for {file}"))
    }

    #[test]
    pub fn includes_defines_and_fragments_become_per_file_flags() {
        let directory = single("compile-single");

        let synthesis = synthesize_database(directory.path(), "Debug")
            .expect("the reply synthesizes")
            .expect("no generator database exists, so one is written");

        assert_eq!(synthesis.files, 1);
        assert_eq!(synthesis.configurations, vec!["Debug".to_string()]);
        assert_eq!(synthesis.path, directory.path().join(DATABASE_FILE));

        let entries = read_database(directory.path());
        assert_eq!(entries.len(), 1, "one source, one entry");
        let entry = find(&entries, "/proj/main.cpp");
        assert_eq!(entry.directory, "/proj/build");
        assert_eq!(
            entry.arguments.first().map(String::as_str),
            Some("/usr/bin/c++")
        );
        for expected in [
            "-g",
            "-arch",
            "arm64",
            "-I",
            "/proj/include",
            "-DDEMO_FLAG=1",
        ] {
            assert!(
                entry.arguments.iter().any(|token| token == expected),
                "the entry carries {expected}: {:?}",
                entry.arguments
            );
        }
        assert_eq!(
            entry.arguments[entry.arguments.len() - 2..].to_vec(),
            vec!["-c".to_string(), "/proj/main.cpp".to_string()],
            "the entry compiles the file itself"
        );
    }

    #[test]
    pub fn the_configuration_being_built_gets_one_entry_per_source() {
        let directory = multi("compile-multi");

        let synthesis = synthesize_database(directory.path(), "Release")
            .expect("the reply synthesizes")
            .expect("a multi-config tree gets a database");

        assert_eq!(synthesis.configurations, vec!["Release".to_string()]);
        assert_eq!(synthesis.files, 3, "three targets, one entry each");
        let entries = read_database(directory.path());
        assert_eq!(
            entries.len(),
            3,
            "one entry per source for the configuration the build uses"
        );
        let main = find(&entries, "/proj/src/main.cpp");
        assert!(
            main.arguments.contains(&"-O3".to_string())
                && main.arguments.contains(&"-DNDEBUG".to_string()),
            "the Release command is the one written: {:?}",
            main.arguments
        );
        assert!(
            !main.arguments.contains(&"-g".to_string()),
            "Debug's flags are not left behind: {:?}",
            main.arguments
        );
        assert!(
            entries
                .iter()
                .any(|entry| entry.file == "/proj/tools/other.c"
                    && entry.arguments.first().map(String::as_str) == Some("/usr/bin/cc")),
            "a C target compiles with the C driver"
        );
    }

    #[test]
    pub fn a_generators_own_database_stays_authoritative() {
        let directory = single("compile-authoritative");
        let path = directory.path().join(DATABASE_FILE);
        let sentinel =
            "[{\"directory\":\"/generated\",\"file\":\"/proj/main.cpp\",\"arguments\":[]}]\n";
        fs::write(&path, sentinel).expect("the generator database");

        let synthesis = synthesize_database(directory.path(), "Debug")
            .expect("an existing database is not an error");

        assert!(synthesis.is_none(), "no second database is written");
        assert_eq!(
            fs::read_to_string(&path).expect("the file survives"),
            sentinel,
            "the generator's own entries are untouched"
        );
    }

    #[test]
    pub fn a_multi_config_database_is_refreshed_on_the_next_configure() {
        let directory = multi("compile-refresh");
        synthesize_database(directory.path(), "Debug")
            .expect("the reply synthesizes")
            .expect("the first database is written");
        let path = directory.path().join(DATABASE_FILE);
        fs::write(&path, "[]\n").expect("a stale copy of our own database");

        let again = synthesize_database(directory.path(), "Debug")
            .expect("the reply still synthesizes")
            .expect("our own database is rewritten");

        assert!(again.changed, "a database that is not current is rewritten");
        assert_eq!(again.files, 3);
        assert!(
            fs::read_to_string(&path)
                .expect("the fresh database")
                .contains("DEMO_FLAG=1"),
            "the refreshed database carries the current flags, not the stale copy"
        );
    }

    #[test]
    pub fn an_unreadable_reply_writes_no_database() {
        let directory = broken("compile-broken");

        let error =
            synthesize_database(directory.path(), "Debug").expect_err("a broken reply is an error");

        assert!(error.contains("codemodel-v2-absent"), "{error}");
        assert!(
            !directory.path().join(DATABASE_FILE).exists(),
            "a half-read model must not leave a database behind"
        );
    }

    #[test]
    pub fn a_reply_without_a_toolchain_uses_the_conventional_driver() {
        let compilers = Compilers::default();

        assert_eq!(compilers.driver(Some("C")), "cc");
        assert_eq!(compilers.driver(Some("CXX")), "c++");
        assert_eq!(compilers.driver(None), "cc");
        assert!(!compilers.has("CXX"));
    }

    #[test]
    pub fn a_fragment_holding_several_flags_is_split_into_argv() {
        assert_eq!(
            fragment_tokens("-g -arch arm64"),
            vec!["-g", "-arch", "arm64"]
        );
        assert_eq!(
            fragment_tokens("\"-DFOO=one two\""),
            vec!["-DFOO=one two"],
            "a double-quoted run stays one argv token, which is how a define holding a space travels"
        );
        assert_eq!(
            fragment_tokens("'-std=gnu++20' -g"),
            vec!["-std=gnu++20", "-g"],
            "the Xcode generator quotes a flag carrying `=`, and the quotes are not part of it"
        );
    }
}
