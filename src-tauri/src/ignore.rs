//! One ignore list for the whole crate: directories never descended into, files never shown,
//! and the glob excludes handed to ripgrep.
//!
//! Two kinds of entry live here. The first is a name no tree wants walked (`target`, `node_modules`,
//! `.git`). The second is output the two supported toolchains write into the project itself —
//! CMake's `CMakeFiles/` and `cmake-build-*/`, and clangd's `.cache/` index. That output is generated
//! and never edited, and in a small C++ project it outnumbers the real files: a quick-open list of one
//! `src/main.cpp` plus forty `CMakeFiles/**/*.make` is useless.

/// Directories that are never walked, listed or searched.
pub const DIRS: [&str; 8] = [
    "target",
    "node_modules",
    "dist",
    "out",
    ".git",
    ".quarry",
    ".cache",
    "CMakeFiles",
];

/// Directory-name prefixes, for a generated tree named after the generator that wrote it.
pub const DIR_PREFIXES: [&str; 1] = ["cmake-build-"];

/// Files that are never shown or searched.
pub const FILES: [&str; 3] = [".DS_Store", "CMakeCache.txt", "cmake_install.cmake"];

/// Whether `name` is an ignored directory.
pub fn is_dir(name: &str) -> bool {
    DIRS.contains(&name) || DIR_PREFIXES.iter().any(|prefix| name.starts_with(prefix))
}

/// Whether `name` is an ignored file.
pub fn is_file(name: &str) -> bool {
    FILES.contains(&name)
}

/// The `!name` style globs passed to ripgrep via `-g`, derived from the same lists so the two
/// surfaces cannot drift: a directory quick open skips must also be one search does not read.
pub fn ripgrep_excludes() -> Vec<String> {
    let mut excludes: Vec<String> = DIRS.iter().map(|name| format!("!{name}")).collect();
    excludes.extend(DIR_PREFIXES.iter().map(|prefix| format!("!{prefix}*")));
    excludes.extend(FILES.iter().map(|name| format!("!{name}")));
    excludes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dirs_cover_every_skipped_directory() {
        for name in DIRS {
            assert!(is_dir(name), "{name} should be ignored");
        }
        assert!(is_dir("dist"), "frontend output is skipped everywhere");
        assert!(is_dir("out"), "native build output is skipped everywhere");
        assert!(!is_dir("src"));
        assert!(!is_dir("lib"));
    }

    #[test]
    fn generated_build_trees_are_skipped_by_prefix() {
        assert!(is_dir("cmake-build-debug"));
        assert!(is_dir("cmake-build-release"));
        assert!(!is_dir("cmake-build"));
    }

    #[test]
    fn files_cover_every_skipped_file() {
        for name in FILES {
            assert!(is_file(name), "{name} should be ignored");
        }
        assert!(!is_file("main.rs"));
    }

    #[test]
    fn ripgrep_excludes_match_the_shared_lists() {
        let excludes = ripgrep_excludes();
        for name in DIRS {
            assert!(excludes.contains(&format!("!{name}")), "missing !{name}");
        }
        assert!(excludes.contains(&"!cmake-build-*".to_string()));
        for name in FILES {
            assert!(excludes.contains(&format!("!{name}")), "missing !{name}");
        }
    }
}
