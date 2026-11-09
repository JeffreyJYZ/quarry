//! The filter that keeps a build out of the event stream.

#![allow(unused_imports)]

use super::*;

#[cfg(test)]
mod filter {
    use super::*;

    fn root() -> PathBuf {
        PathBuf::from("/project")
    }

    #[test]
    fn a_path_inside_target_is_ignored() {
        assert!(is_ignored(&root().join("target/debug/quarry"), &root()));
    }

    #[test]
    fn every_generated_tree_is_ignored() {
        let names = [
            "build",
            ".git",
            ".quarry",
            "node_modules",
            "dist",
            ".cache",
            "CMakeFiles",
            "cmake-build-debug",
        ];
        for name in names {
            let changed = root().join(name).join("out.rs");
            assert!(is_ignored(&changed, &root()), "{name} must be ignored");
        }
    }

    #[test]
    fn a_source_file_and_the_root_itself_are_watched() {
        assert!(!is_ignored(&root().join("src/main.rs"), &root()));
        assert!(!is_ignored(&root(), &root()));
    }

    #[test]
    fn a_name_that_only_starts_with_an_excluded_one_is_watched() {
        assert!(!is_ignored(&root().join("targeting/lib.rs"), &root()));
        assert!(!is_ignored(&root().join("builder/Cargo.toml"), &root()));
        assert!(!is_ignored(&root().join("src/distances.rs"), &root()));
    }

    #[test]
    fn a_path_outside_the_root_is_ignored() {
        assert!(is_ignored(Path::new("/elsewhere/src/main.rs"), &root()));
    }
}
