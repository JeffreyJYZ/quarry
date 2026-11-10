//! Anonymous bookmarks, one set per project.
//!
//! A bookmark is a line in a file under the project root, and nothing else: CLion's anonymous
//! bookmarks carry no name, no mnemonic and no persistence outside the project they belong to, so
//! this module never reaches beyond `<root>/.quarry/bookmarks.json`.
//!
//! The file stores root-relative `/` paths, which keeps a project portable between machines and
//! between macOS and Windows. A read is tolerant: a missing file is a project with no bookmarks, an
//! unreadable or malformed file is the same thing rather than an error dialog, and an entry whose
//! file has since been deleted is dropped from the answer. Writes go through
//! `crate::atomic_write`, so a crash mid-save leaves the previous file intact.

#![allow(unused_imports)]

mod commands;
pub use commands::*;

mod model;
pub use model::*;

mod store;
pub use store::*;

mod tests_paths;
pub use tests_paths::*;

mod tests_persist;
pub use tests_persist::*;

mod tests_toggle;
pub use tests_toggle::*;
