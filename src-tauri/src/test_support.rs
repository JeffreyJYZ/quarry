//! Shared test helpers for PATH-mutating tests.
//!
//! `PATH` is process-wide, so a single lock guards every test that reads or writes it.

#![allow(dead_code)]

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::SystemTime;

pub fn path_lock() -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    let guard = LOCK.get_or_init(|| Mutex::new(())).lock();
    guard.unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn with_path<T>(value: &str, body: impl FnOnce() -> T) -> T {
    let _guard = path_lock();
    let previous = std::env::var_os("PATH");
    unsafe { std::env::set_var("PATH", value) };
    let result = body();
    match previous {
        Some(previous) => unsafe { std::env::set_var("PATH", previous) },
        None => unsafe { std::env::remove_var("PATH") },
    }
    result
}

pub struct TempDir(PathBuf);

impl TempDir {
    pub fn new(tag: &str) -> Self {
        let mut path = std::env::temp_dir();
        let stamp = SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos())
            .unwrap_or(0);
        path.push(format!(
            "quarry-resolve-{tag}-{}-{stamp}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("temporary directory");
        Self(path)
    }

    pub fn path(&self) -> &Path {
        &self.0
    }

    pub fn file(&self, name: &str, executable: bool) -> PathBuf {
        let path = self.0.join(name);
        fs::write(&path, "#!/bin/sh\n").expect("write file");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = if executable { 0o755 } else { 0o644 };
            fs::set_permissions(&path, fs::Permissions::from_mode(mode)).expect("chmod");
        }
        path
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
