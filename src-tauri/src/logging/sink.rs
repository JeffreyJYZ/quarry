//! The append-only writer: one file, a rotation at [`MAX_BYTES`], flushed per write.
//!
//! The file is opened lazily so a sink built before its directory exists still works, and its size
//! is read from the filesystem rather than trusted from the process, so a restart appends to the
//! file the previous run left instead of starting from an assumed zero.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Rotate once the file would pass this size; one `.1` backup is kept beside it.
pub const MAX_BYTES: u64 = 2 * 1024 * 1024;

/// The open file and how much this handle has put in it.
struct Open {
    file: File,
    size: u64,
}

pub struct Sink {
    path: PathBuf,
    limit: u64,
    state: Mutex<Option<Open>>,
}

impl Sink {
    pub fn new(path: PathBuf) -> Self {
        Self::with_limit(path, MAX_BYTES)
    }

    /// The limit is a parameter so the rotation is tested against a small file rather than by
    /// writing two megabytes.
    pub fn with_limit(path: PathBuf, limit: u64) -> Self {
        Self {
            path,
            limit,
            state: Mutex::new(None),
        }
    }

    /// Append one line. A poisoned lock still writes: a panic elsewhere must not cost the log.
    pub fn write_line(&self, line: &str) -> io::Result<()> {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if state.is_none() {
            *state = Some(self.open()?);
        }
        let bytes = line.len() as u64 + 1;
        let rotate_now = state
            .as_ref()
            .is_some_and(|open| open.size > 0 && open.size + bytes > self.limit);
        if rotate_now {
            // Drop the handle before renaming: Windows refuses to rename a file it still has open.
            *state = None;
            rotate(&self.path)?;
            *state = Some(self.open()?);
        }
        let open = state
            .as_mut()
            .ok_or_else(|| io::Error::other("the log sink has no file"))?;
        open.file.write_all(line.as_bytes())?;
        open.file.write_all(b"\n")?;
        // Flushed per write, so a crash keeps every line up to the one that killed it.
        open.file.flush()?;
        open.size += bytes;
        Ok(())
    }

    fn open(&self) -> io::Result<Open> {
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir)?;
        }
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)?;
        let size = file.metadata()?.len();
        Ok(Open { file, size })
    }
}

/// `quarry.log` becomes `quarry.log.1`, replacing the previous backup.
fn rotate(path: &Path) -> io::Result<()> {
    let backup = backup_path(path);
    // `rename` replaces an existing target on Unix but not on Windows, so clear it first on both.
    let _ = fs::remove_file(&backup);
    fs::rename(path, backup)
}

fn backup_path(path: &Path) -> PathBuf {
    let mut name = path
        .file_name()
        .map(|name| name.to_os_string())
        .unwrap_or_default();
    name.push(".1");
    path.with_file_name(name)
}
