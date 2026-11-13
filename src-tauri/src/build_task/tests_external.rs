#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

use super::*;

/// A canonical Windows path is not an argument: the marker Win32 accepts and MSBuild rejects.
///
/// The transform is tested on every platform because it is a string decision, which is what makes a
/// Windows failure reproducible here without one.
#[cfg(test)]
#[allow(dead_code)]
pub mod external_tests {
    use super::*;

    #[test]
    pub fn a_canonical_drive_path_loses_the_marker() {
        assert_eq!(external_str(r"\\?\C:\dev\proj\build"), r"C:\dev\proj\build");
        assert_eq!(external_str(r"\\?\D:\a\_work\quarry"), r"D:\a\_work\quarry");
    }

    #[test]
    pub fn a_canonical_unc_path_becomes_a_network_path_again() {
        assert_eq!(
            external_str(r"\\?\UNC\server\share\build"),
            r"\\server\share\build"
        );
    }

    #[test]
    pub fn anything_that_is_not_a_canonical_path_is_untouched() {
        for path in [
            "/Users/jyz/dev/quarry/build",
            r"C:\dev\quarry\build",
            r"\\?\Volume{0123-4567}\build",
            "build/parity_vs",
            "",
        ] {
            assert_eq!(external_str(path), path, "{path} must travel unchanged");
        }
    }

    #[test]
    pub fn a_path_is_rendered_for_its_consumer() {
        assert_eq!(external(Path::new("/tmp/proj/build")), "/tmp/proj/build");
    }
}
