#![allow(unused_imports)]

//! What a clangd session is handed for a project that has no build system.

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

#[cfg(test)]
pub mod tests {
    use crate::build_task::QUARRY_BUILD_DIR;

    use super::support::*;
    use super::*;

    fn build_directory(fixture: &Fixture) -> PathBuf {
        fixture.root().join(QUARRY_BUILD_DIR)
    }

    #[test]
    fn a_plain_project_is_handed_the_database_its_build_writes() {
        let fixture = Fixture::new("plain-handoff");
        fixture.write("lib/greet.cpp", "#include \"greet.h\"\n");
        let info = fixture.plain_project();

        let (args, database) = server_args("clangd", &info, &[]);

        let expected = build_directory(&fixture);
        assert_eq!(database, Some(expected.clone()));
        assert!(
            args.iter()
                .any(|arg| arg == &format!("{COMPILE_COMMANDS_DIR}={}", expected.display())),
            "the session names the tree the plain build writes: {args:?}"
        );
        let path = expected.join(crate::project::DATABASE_FILE);
        assert!(
            path.is_file(),
            "the database is written where clangd reads it"
        );
        let entries = crate::project::read_entries(&path);
        assert_eq!(entries.len(), 2, "one entry per source: {entries:?}");
        let main = entries
            .iter()
            .find(|entry| entry.argv.iter().any(|arg| arg.ends_with("main.cpp")))
            .expect("the entry for main.cpp");
        assert!(
            main.argv
                .contains(&format!("-I{}", fixture.root().display())),
            "the root is searched, so `lib/greet.h` resolves: {:?}",
            main.argv
        );
        if crate::resolve::resolve("clang++").is_some() {
            assert!(
                args.iter().any(|arg| arg.starts_with(QUERY_DRIVER)),
                "clangd may query the compiler the database names: {args:?}"
            );
        }
    }

    #[test]
    fn a_project_stating_its_own_flags_gets_no_database_from_us() {
        let fixture = Fixture::new("plain-instruction");
        fixture.write("main.cpp", "int main() { return 0; }\n");
        fixture.write("compile_flags.txt", "-std=c++23\n");
        let info = fixture.plain_info();

        let (args, database) = server_args("clangd", &info, &[]);

        assert_eq!(database, None, "the user's own file is what clangd reads");
        assert!(!build_directory(&fixture).exists());
        assert!(
            !args.iter().any(|arg| arg.starts_with(COMPILE_COMMANDS_DIR)),
            "{args:?}"
        );
    }

    #[test]
    fn a_project_with_its_own_database_keeps_that_one() {
        let fixture = Fixture::new("plain-own-database");
        fixture.write("main.cpp", "int main() { return 0; }\n");
        fixture.write("build/compile_commands.json", "[]");
        let info = fixture.plain_info();

        let (_, database) = server_args("clangd", &info, &[]);

        assert_eq!(database, Some(fixture.root().join("build")));
        assert!(
            !build_directory(&fixture).exists(),
            "nothing is written beside it"
        );
    }

    #[test]
    fn a_directory_with_no_source_is_handed_nothing() {
        let fixture = Fixture::new("plain-empty");
        let info = fixture.plain_info();

        let (args, database) = server_args("clangd", &info, &[]);

        assert_eq!(database, None);
        assert!(args.is_empty(), "{args:?}");
        assert!(!build_directory(&fixture).exists());
    }

    #[test]
    fn a_directory_the_user_named_is_never_second_guessed() {
        let fixture = Fixture::new("plain-user-dir");
        let info = fixture.plain_project();
        let user = vec![format!("{COMPILE_COMMANDS_DIR}=/elsewhere")];

        let (args, database) = server_args("clangd", &info, &user);

        assert_eq!(database, None);
        assert_eq!(
            args, user,
            "their directory is never replaced or reconfigured"
        );
        assert!(!build_directory(&fixture).exists());
    }
}
