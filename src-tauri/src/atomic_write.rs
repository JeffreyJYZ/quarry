//! Temporary-file writes that never leave a half-written target behind.
//!
//! `fs::write` truncates the target before the first byte lands, so a crash, a full disk or a
//! failure half-way leaves an empty or half-written file. Every write here goes to a sibling
//! temporary file created with `create_new` (a planted symlink cannot redirect it), is flushed,
//! and is then renamed over the target, which is atomic inside one directory.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// A process-unique suffix, so a temporary name can be neither predicted nor planted.
fn unique_suffix() -> String {
    let count = COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    format!("{}-{nanos}-{count}", std::process::id())
}

/// A temporary file removed on drop unless it was renamed into place.
pub struct TempFile {
    path: PathBuf,
    armed: bool,
}

impl TempFile {
    /// A not-yet-created sibling of `target`, in the same directory.
    pub fn sibling(target: &Path) -> Self {
        let name = target
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("file");
        Self {
            path: target.with_file_name(format!("{name}.{}.tmp", unique_suffix())),
            armed: true,
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Creates the file, failing when anything already occupies the path.
    pub fn create(&self) -> std::io::Result<File> {
        OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&self.path)
    }

    /// The file now owns its final name, so dropping this guard removes nothing.
    pub fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for TempFile {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_file(&self.path);
        }
    }
}

/// Replaces `target` with `bytes` through a flushed sibling file and an atomic rename.
///
/// The target keeps its previous permissions, because the replacement inherits them before the
/// rename; a file that did not exist yet gets the default mode.
pub fn replace(target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut temp = TempFile::sibling(target);
    {
        let mut file = temp.create()?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    if let Ok(metadata) = fs::metadata(target) {
        fs::set_permissions(temp.path(), metadata.permissions())?;
    }
    fs::rename(temp.path(), target)?;
    temp.disarm();
    Ok(())
}

/// A private directory under the system temp dir, removed with its contents on drop.
pub struct TempDir {
    path: PathBuf,
}

impl TempDir {
    /// Creates a fresh directory; an existing path makes this fail instead of being reused.
    pub fn create(prefix: &str) -> std::io::Result<Self> {
        let path = std::env::temp_dir().join(format!("{prefix}-{}", unique_suffix()));
        fs::create_dir(&path)?;
        Ok(Self { path })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}
