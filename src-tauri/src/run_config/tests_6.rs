#![allow(unused_imports)]

pub(crate) use crate::types::{LaunchConfig, LaunchFile};
pub use std::fs;
pub use std::io::ErrorKind;
pub use std::path::{Path, PathBuf};

use super::*;

#[cfg(test)]
#[allow(dead_code)]
pub mod tests_group_6 {
    use super::*;

    use crate::run_config::tests_group_5::{Fixture, preset};

    /// The write goes through a temp and a rename, so a failure before the rename leaves the
    /// previous file exactly as it was instead of truncating it.
    #[cfg(unix)]
    #[test]
    pub fn a_failed_write_leaves_the_previous_file_intact() {
        use std::os::unix::fs::PermissionsExt;

        // Root ignores the directory mode, so the failure cannot be provoked there.
        if unsafe { libc::geteuid() } == 0 {
            return;
        }

        let fixture = Fixture::new("interrupted");
        let root = fixture.root();
        let first = LaunchFile {
            configurations: vec![preset("run")],
        };
        let path = PathBuf::from(write(&root, &first).expect("first write"));
        let previous = fs::read_to_string(&path).expect("read");
        let directory = path.parent().expect("parent").to_path_buf();

        fs::set_permissions(&directory, fs::Permissions::from_mode(0o555))
            .expect("make the directory reject new files");

        let next = LaunchFile {
            configurations: vec![preset("other")],
        };
        let result = write(&root, &next);

        fs::set_permissions(&directory, fs::Permissions::from_mode(0o755))
            .expect("restore the directory mode");

        assert!(
            result.is_err(),
            "a directory that rejects the temp file must fail the write"
        );
        assert_eq!(
            fs::read_to_string(&path).expect("read"),
            previous,
            "the previous launch configuration must be untouched"
        );
    }
}
