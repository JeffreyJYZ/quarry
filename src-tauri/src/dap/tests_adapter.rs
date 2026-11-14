//! Which directory an adapter can actually start from.
//!
//! `lldb-dap.exe` loads `liblldb.dll` from its own directory on Windows, so a candidate whose
//! directory lacks it is a binary that exits before the handshake. The order is a *preference*, not
//! an exclusion: an adapter linked statically still works from its own directory, it is only tried
//! after the ones that carry the library.

use std::fs;
use std::path::{Path, PathBuf};

use super::data_breakpoint_info_from::prefer_runnable;

fn directory_with(root: &Path, name: &str, files: &[&str]) -> PathBuf {
    let directory = root.join(name);
    fs::create_dir_all(&directory).expect("create a candidate directory");
    for file in files {
        fs::write(directory.join(file), b"x").expect("write a candidate file");
    }
    directory
}

#[test]
fn a_directory_carrying_the_loader_comes_first() {
    let temp = crate::test_support::TempDir::new("adapter-preference");
    let bare = directory_with(temp.path(), "bare", &["lldb-dap.exe"]);
    let runnable = directory_with(temp.path(), "runnable", &["lldb-dap.exe", "liblldb.dll"]);

    let ordered = prefer_runnable(vec![bare.clone(), runnable.clone()], "liblldb.dll");

    assert_eq!(ordered, vec![runnable, bare]);
}

#[test]
fn directories_without_the_loader_keep_the_order_they_were_given() {
    let temp = crate::test_support::TempDir::new("adapter-preference-order");
    let first = directory_with(temp.path(), "first", &["lldb-dap.exe"]);
    let second = directory_with(temp.path(), "second", &["lldb-dap.exe"]);

    let ordered = prefer_runnable(vec![first.clone(), second.clone()], "liblldb.dll");

    assert_eq!(ordered, vec![first, second]);
}

#[test]
fn nothing_is_dropped_when_no_directory_has_the_loader() {
    let temp = crate::test_support::TempDir::new("adapter-preference-none");
    let only = directory_with(temp.path(), "only", &["lldb-dap"]);

    let ordered = prefer_runnable(vec![only.clone()], "liblldb.dll");

    assert_eq!(
        ordered,
        vec![only],
        "a statically linked build must survive"
    );
}
