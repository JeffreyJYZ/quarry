#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod database_tests {
    use super::*;

    fn read_database(root: &Path) -> Vec<CompileEntry> {
        let text = fs::read_to_string(root.join(DATABASE_FILE)).expect("the database is written");
        serde_json::from_str(&text).expect("the database is a JSON array of entries")
    }

    #[test]
    pub fn a_profile_the_reply_does_not_describe_names_what_it_found() {
        let directory = multi("database-unknown-config");

        let error = synthesize_database(directory.path(), "MinSizeRel")
            .expect_err("a configuration the reply does not describe is an error");

        assert!(
            error.contains("MinSizeRel"),
            "it names the profile: {error}"
        );
        assert!(
            error.contains("Debug") && error.contains("Release"),
            "it names what the reply describes instead: {error}"
        );
        assert!(
            !directory.path().join(DATABASE_FILE).exists(),
            "another configuration's entries are never written as if they were this one's"
        );
    }

    #[test]
    pub fn switching_configuration_rewrites_the_database() {
        let directory = multi("database-switch");
        let first = synthesize_database(directory.path(), "Debug")
            .expect("the reply synthesizes")
            .expect("the first database is written");
        assert!(first.changed);
        assert_eq!(first.configurations, vec!["Debug".to_string()]);
        assert!(
            read_database(directory.path())
                .iter()
                .all(|entry| entry.arguments.contains(&"-g".to_string())),
            "Debug's entries carry debug info"
        );

        let second = synthesize_database(directory.path(), "Release")
            .expect("the reply synthesizes")
            .expect("the same tree is written again");
        assert!(
            second.changed,
            "the file described another configuration, so it is not current"
        );
        let entries = read_database(directory.path());
        assert_eq!(
            entries.len(),
            3,
            "one entry per source, not one per source per configuration"
        );
        assert!(
            entries
                .iter()
                .all(|entry| !entry.arguments.contains(&"-g".to_string())),
            "no Debug entry is left behind: {entries:?}"
        );
        assert!(
            entries
                .iter()
                .filter(|entry| entry.file == "/proj/src/main.cpp")
                .all(|entry| entry.arguments.contains(&"-O3".to_string())),
            "the entry is Release's: {entries:?}"
        );

        let again = synthesize_database(directory.path(), "Release")
            .expect("the reply synthesizes")
            .expect("the tree still has a database");
        assert!(
            !again.changed,
            "the configuration it already describes is current"
        );
    }

    #[test]
    pub fn a_single_config_tree_keeps_the_one_configuration_it_was_configured_with() {
        let directory = single("database-single");

        let synthesis = synthesize_database(directory.path(), "Release")
            .expect("the reply synthesizes")
            .expect("a single-config tree gets a database");

        assert_eq!(synthesis.files, 1);
        assert_eq!(
            synthesis.configurations,
            vec!["Debug".to_string()],
            "a single-config generator has one configuration and the tree already names it"
        );
        assert!(
            read_database(directory.path())[0]
                .arguments
                .contains(&"-g".to_string()),
            "its flags are the ones its configure used"
        );
    }
}
