//! Tool discovery for formatters.
//!
//! A Dock-launched macOS app inherits launchd's bare `PATH`, so Homebrew and cargo binaries are
//! invisible. `PATH` stays first so a user-pinned tool wins; the well-known directories follow.

use std::env;
use std::path::{Path, PathBuf};

/// Build the ordered, de-duplicated directory list searched by [`find_on_path`].
///
/// `path_env` and `home` are the raw environment values so tests can drive the function without
/// touching the process environment.
pub fn candidate_dirs(
    path_env: Option<&std::ffi::OsStr>,
    home: Option<&std::ffi::OsStr>,
) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    let mut seen: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

    let push =
        |dirs: &mut Vec<PathBuf>, seen: &mut std::collections::HashSet<PathBuf>, dir: PathBuf| {
            if dir.as_os_str().is_empty() {
                return;
            }
            if !dir.is_dir() {
                return;
            }
            if !seen.insert(dir.clone()) {
                return;
            }
            dirs.push(dir);
        };

    if let Some(path) = path_env {
        for dir in env::split_paths(path) {
            push(&mut dirs, &mut seen, dir);
        }
    }

    #[cfg(unix)]
    {
        for extra in ["/opt/homebrew/bin", "/usr/local/bin"] {
            push(&mut dirs, &mut seen, PathBuf::from(extra));
        }
        if let Some(home) = home {
            let cargo_bin = PathBuf::from(home).join(".cargo").join("bin");
            push(&mut dirs, &mut seen, cargo_bin);
        }
    }

    let _ = home;
    dirs
}

/// Walk the candidate directories for an executable named `name`.
pub fn find_on_path(name: &str) -> Option<String> {
    let path_env = env::var_os("PATH");
    let home = env::var_os("HOME");
    candidate_dirs(path_env.as_deref(), home.as_deref())
        .into_iter()
        .find_map(|dir| {
            let candidate = dir.join(name);
            is_executable(&candidate).then(|| candidate.to_string_lossy().into_owned())
        })
}

#[cfg(unix)]
pub fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
pub fn is_executable(path: &Path) -> bool {
    std::fs::metadata(path)
        .map(|meta| meta.is_file())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;
    use std::fs;

    #[test]
    fn candidate_dirs_orders_path_then_extras() {
        let tmp = tempfile_dir();
        let a = tmp.join("a");
        let b = tmp.join("b");
        fs::create_dir_all(&a).unwrap();
        fs::create_dir_all(&b).unwrap();
        let path = std::env::join_paths([a.clone(), b.clone()]).unwrap();
        let home = tmp.join("home");
        fs::create_dir_all(home.join(".cargo").join("bin")).unwrap();
        let dirs = candidate_dirs(Some(path.as_os_str()), Some(home.as_os_str()));
        assert_eq!(dirs[0], a);
        assert_eq!(dirs[1], b);
    }

    #[test]
    fn candidate_dirs_dedups() {
        let tmp = tempfile_dir();
        let a = tmp.join("a");
        fs::create_dir_all(&a).unwrap();
        let path = std::env::join_paths([a.clone(), a.clone()]).unwrap();
        let dirs = candidate_dirs(Some(path.as_os_str()), None);
        assert_eq!(dirs.iter().filter(|d| *d == &a).count(), 1);
    }

    #[test]
    fn candidate_dirs_skips_file_entry() {
        let tmp = tempfile_dir();
        let f = tmp.join("notadir");
        fs::write(&f, b"x").unwrap();
        let path = std::env::join_paths([f.clone()]).unwrap();
        let dirs = candidate_dirs(Some(path.as_os_str()), None);
        assert!(!dirs.contains(&f));
    }

    #[test]
    fn candidate_dirs_skips_empty_segment() {
        let tmp = tempfile_dir();
        let a = tmp.join("a");
        fs::create_dir_all(&a).unwrap();
        // empty segment between two colons
        // build PATH with empty segment manually
        let path = format!(":/nonexistent-maybe:{}", a.display());
        let dirs = candidate_dirs(Some(std::ffi::OsStr::new(&path)), None);
        assert!(dirs.contains(&a));
    }

    #[test]
    fn candidate_dirs_no_cargo_when_home_unset() {
        let tmp = tempfile_dir();
        let a = tmp.join("a");
        fs::create_dir_all(&a).unwrap();
        let path = std::env::join_paths([a.clone()]).unwrap();
        let dirs = candidate_dirs(Some(path.as_os_str()), None);
        assert!(!dirs.iter().any(|d| d.ends_with(".cargo/bin")));
    }

    fn tempfile_dir() -> PathBuf {
        let base = std::env::temp_dir().join("quarry-tool-search-tests");
        let _ = fs::create_dir_all(&base);
        base
    }

    #[test]
    fn taplo_formats_when_discoverable() {
        let _guard = crate::test_support::path_lock();
        let available = find_on_path("taplo").is_some() || find_on_path("taplo-cli").is_some();
        if !available {
            return;
        }
        let out = crate::format::run::run(crate::format::Formatter::Taplo, "", "x.toml", "a = 1\n");
        assert!(out.is_ok(), "{out:?}");
    }
}
