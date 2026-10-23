//! One ignore list for the whole crate: directories never descended into, files never shown,
//! and the glob excludes handed to ripgrep.

/// Directories that are never walked, listed or searched.
pub const DIRS: [&str; 5] = ["target", "node_modules", "dist", ".git", ".quarry"];

/// Files that are never shown or searched.
pub const FILES: [&str; 1] = [".DS_Store"];

/// Whether `name` is an ignored directory.
pub fn is_dir(name: &str) -> bool {
    DIRS.contains(&name)
}

/// Whether `name` is an ignored file.
pub fn is_file(name: &str) -> bool {
    FILES.contains(&name)
}

/// The `!name` style globs passed to ripgrep via `-g`.
pub fn ripgrep_excludes() -> [&'static str; 5] {
    ["!target", "!node_modules", "!dist", "!.git", "!.quarry"]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dirs_cover_every_skipped_directory() {
        for name in ["target", "node_modules", "dist", ".git", ".quarry"] {
            assert!(is_dir(name), "{name} should be ignored");
        }
        assert!(!is_dir("src"));
        assert!(!is_dir("lib"));
    }

    #[test]
    fn files_cover_every_skipped_file() {
        assert!(is_file(".DS_Store"));
        assert!(!is_file("main.rs"));
    }

    #[test]
    fn ripgrep_excludes_match_dirs_in_order() {
        assert_eq!(
            ripgrep_excludes(),
            ["!target", "!node_modules", "!dist", "!.git", "!.quarry"]
        );
    }
}
