#![allow(unused_imports)]

//! What a clangd session analyses when the build profile is not the default.

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub use crate::build_task::{BUILD_TYPE_VARIABLE, BuildProfile, cache_value};
pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

#[cfg(test)]
pub mod tests {
    use super::support::*;
    use super::*;

    fn configured_profile(fixture: &Fixture) -> String {
        let build = fixture.root().join("build");
        cache_value(&build, BUILD_TYPE_VARIABLE).unwrap_or_default()
    }

    fn project(label: &str) -> Fixture {
        let fixture = Fixture::new(label);
        fixture.write("CMakeLists.txt", CMAKE_LISTS);
        fixture.write("main.cpp", "int main() { return 0; }\n");
        fixture
    }

    /// The compile flags the database the session names carries for `main.cpp`.
    fn flags(fixture: &Fixture) -> Vec<String> {
        let database = fixture
            .root()
            .join("build")
            .join(crate::project::DATABASE_FILE);
        let entries = crate::project::read_entries(&database);
        entries
            .iter()
            .find(|entry| entry.argv.iter().any(|arg| arg.ends_with("main.cpp")))
            .map(|entry| entry.argv.clone())
            .expect("an entry for main.cpp")
    }

    #[test]
    fn a_first_configure_uses_the_profile_the_build_would() {
        if !cmake_available() {
            return;
        }
        let fixture = project("profile-fresh");

        let found = server_args("clangd", &fixture.info(), &[], BuildProfile::RelWithDebInfo);

        assert_eq!(found.database, Some(fixture.root().join("build")));
        assert_eq!(configured_profile(&fixture), "RelWithDebInfo");
        assert_eq!(
            found.note, None,
            "a tree that never had a profile explains nothing"
        );
        let arguments = flags(&fixture);
        assert!(
            arguments.iter().any(|arg| arg.starts_with("-O2")) && arguments.contains(&"-g".into()),
            "RelWithDebInfo analysis carries -O2 -g: {arguments:?}"
        );
    }

    #[test]
    fn a_tree_configured_for_another_profile_is_reconfigured_once() {
        if !cmake_available() {
            return;
        }
        let fixture = project("profile-switch");
        let initial = server_args("clangd", &fixture.info(), &[], BuildProfile::Debug);
        assert_eq!(configured_profile(&fixture), "Debug");

        // The user switches the profile in settings: the next session follows it, in the same tree.
        let switched = server_args("clangd", &fixture.info(), &[], BuildProfile::RelWithDebInfo);
        assert_eq!(switched.database, initial.database);
        assert_eq!(configured_profile(&fixture), "RelWithDebInfo");
        assert!(
            switched.note.is_some(),
            "reconfiguring the user's tree is said once, not silently"
        );
        let database = fixture
            .root()
            .join("build")
            .join(crate::project::DATABASE_FILE);
        let written = fs::metadata(&database)
            .and_then(|meta| meta.modified())
            .expect("database timestamp");

        // ... and the start after it is quiet: one reconfigure, never one per start.
        let settled = server_args("clangd", &fixture.info(), &[], BuildProfile::RelWithDebInfo);
        assert_eq!(settled.note, None, "the tree now matches the profile");
        assert_eq!(
            fs::metadata(&database)
                .and_then(|meta| meta.modified())
                .expect("database timestamp"),
            written,
            "a current tree is not configured again"
        );
        assert!(
            flags(&fixture).contains(&"-g".into()),
            "the analysis database is the profile's own"
        );
    }
}
