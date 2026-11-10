#![allow(unused_imports)]

pub use serde::{Deserialize, Serialize};
pub use std::fs;
pub use std::path::{Path, PathBuf};

/// One bookmark as the file stores it: a root-relative `/` path and a 1-based line.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct BookmarkEntry {
    pub path: String,
    pub line: u32,
}

/// The whole bookmarks file; absent `bookmarks` reads as an empty project.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct BookmarkFile {
    #[serde(default)]
    pub bookmarks: Vec<BookmarkEntry>,
}

/// One bookmark as the window shows it: the absolute path to open and the line's own text.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Bookmark {
    pub path: String,
    pub line: u32,
    pub text: String,
}

impl BookmarkEntry {
    /// A stored entry that names something a gutter can paint.
    pub fn is_valid(&self) -> bool {
        !self.path.trim().is_empty() && self.line >= 1
    }
}
