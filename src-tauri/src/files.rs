//! Fast file listing for quick-open.
//!
//! Contract: list project files once, honour the same ignore set as search, and never walk into
//! `target`, `node_modules`, `dist`, `.git` or `.quarry`.

use std::fs;
use std::path::{Path, PathBuf};

/// Cap on returned files; the UI filters what it receives.
pub const MAX_FILES: usize = 20_000;

/// Directories that are never descended into (shared with the rest of the crate).
use crate::ignore;

#[tauri::command]
pub async fn list_files(root: String) -> Result<Vec<String>, String> {
    let path = PathBuf::from(&root);
    if !path.is_dir() {
        return Err(format!("list root is not a directory: {root}"));
    }
    let root = absolute_root(&root);
    tauri::async_runtime::spawn_blocking(move || collect(&root, MAX_FILES))
        .await
        .map_err(|error| format!("list task failed: {error}"))?
}

/// Collects files under `root`, stopping once `cap` entries have been gathered.
pub fn collect(root: &Path, cap: usize) -> Result<Vec<String>, String> {
    if !root.is_dir() {
        return Err(format!("list root is not a directory: {}", root.display()));
    }
    let mut files = Vec::new();
    walk(root, &mut files, cap);
    files.sort();
    Ok(files)
}

fn walk(dir: &Path, files: &mut Vec<String>, cap: usize) {
    if files.len() >= cap {
        return;
    }
    let read = match fs::read_dir(dir) {
        Ok(read) => read,
        Err(_) => return,
    };
    for entry in read {
        if files.len() >= cap {
            return;
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let path = entry.path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.is_dir() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if ignore::is_dir(name.as_ref()) {
                continue;
            }
            walk(&path, files, cap);
        } else if metadata.is_file() && files.len() < cap {
            files.push(path.to_string_lossy().into_owned());
        }
    }
}

fn absolute_root(root: &str) -> PathBuf {
    let path = PathBuf::from(root);
    std::path::absolute(&path).unwrap_or(path)
}

fn resolve_root(root: &str) -> Result<PathBuf, String> {
    let root = absolute_root(root);
    if !root.is_dir() {
        return Err(format!(
            "project root is not a directory: {root}",
            root = root.display()
        ));
    }
    Ok(root)
}

fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("name must not be empty".to_string());
    }
    if name.contains('/') || name.contains("\\") {
        return Err("name must not contain a path separator".to_string());
    }
    if name == "." || name == ".." {
        return Err("name must not be '.' or '..'".to_string());
    }
    Ok(())
}

fn ensure_within(root: &Path, target: &Path) -> Result<PathBuf, String> {
    let absolute = std::path::absolute(target).unwrap_or_else(|_| target.to_path_buf());
    if !absolute.starts_with(root) {
        return Err("path is outside the project root".to_string());
    }
    Ok(absolute)
}

#[tauri::command]
pub fn create_file(root: String, parent: String, name: String) -> Result<String, String> {
    validate_name(&name)?;
    let root = resolve_root(&root)?;
    let parent = ensure_within(&root, Path::new(&parent))?;
    if !parent.is_dir() {
        return Err(format!("not a directory: {}", parent.display()));
    }
    let target = parent.join(&name);
    let target = ensure_within(&root, &target)?;
    if target.exists() {
        return Err(format!("already exists: {}", target.display()));
    }
    fs::write(&target, b"")
        .map_err(|error| format!("cannot create {}: {error}", target.display()))?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn create_dir(root: String, parent: String, name: String) -> Result<String, String> {
    validate_name(&name)?;
    let root = resolve_root(&root)?;
    let parent = ensure_within(&root, Path::new(&parent))?;
    if !parent.is_dir() {
        return Err(format!("not a directory: {}", parent.display()));
    }
    let target = parent.join(&name);
    let target = ensure_within(&root, &target)?;
    if target.exists() {
        return Err(format!("already exists: {}", target.display()));
    }
    fs::create_dir(&target)
        .map_err(|error| format!("cannot create {}: {error}", target.display()))?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn rename_path(root: String, old_path: String, new_name: String) -> Result<String, String> {
    validate_name(&new_name)?;
    let root = resolve_root(&root)?;
    let old = ensure_within(&root, Path::new(&old_path))?;
    if !old.exists() {
        return Err(format!("does not exist: {}", old.display()));
    }
    let parent = old
        .parent()
        .ok_or_else(|| "no parent directory".to_string())?;
    let target = parent.join(&new_name);
    let target = ensure_within(&root, &target)?;
    if target.exists() {
        return Err(format!("already exists: {}", target.display()));
    }
    fs::rename(&old, &target)
        .map_err(|error| format!("cannot rename {}: {error}", old.display()))?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn delete_path(root: String, path: String) -> Result<(), String> {
    let root = resolve_root(&root)?;
    let target = ensure_within(&root, Path::new(&path))?;
    if target == root {
        return Err("cannot delete the project root".to_string());
    }
    if !target.exists() {
        return Err(format!("does not exist: {}", target.display()));
    }
    if target.is_dir() {
        fs::remove_dir_all(&target)
            .map_err(|error| format!("cannot delete {}: {error}", target.display()))?;
    } else {
        fs::remove_file(&target)
            .map_err(|error| format!("cannot delete {}: {error}", target.display()))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ignore;
    use std::env;
    use std::os::unix::fs::symlink;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    struct Fixture {
        path: PathBuf,
    }

    impl Fixture {
        fn new(label: &str) -> Self {
            let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = env::temp_dir().join(format!(
                "quarry-files-{label}-{}-{unique}",
                std::process::id()
            ));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).expect("create fixture directory");
            Self { path }
        }

        fn dir(&self, name: &str) {
            fs::create_dir_all(self.path.join(name)).expect("create fixture directory");
        }

        fn file(&self, name: &str, contents: &str) {
            if let Some(parent) = self.path.join(name).parent() {
                let _ = fs::create_dir_all(parent);
            }
            fs::write(self.path.join(name), contents).expect("write fixture file");
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn ignored_set_covers_every_skipped_name() {
        for name in ["target", "node_modules", "dist", ".git", ".quarry"] {
            assert!(ignore::is_dir(name), "{name} should be ignored");
        }
        assert!(!ignore::is_dir("src"));
        assert!(!ignore::is_dir("lib"));
    }

    #[test]
    fn collect_returns_sorted_absolute_paths() {
        let fixture = Fixture::new("sort");
        fixture.file("z.txt", "z");
        fixture.file("a.txt", "a");
        fixture.dir("nested");
        fixture.file("nested/m.txt", "m");

        let result = collect(&fixture.path, MAX_FILES).expect("collect");
        let expected = vec![
            fixture.path.join("a.txt"),
            fixture.path.join("nested/m.txt"),
            fixture.path.join("z.txt"),
        ]
        .into_iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
        assert_eq!(result, expected);
    }

    #[test]
    fn collect_skips_ignored_directories() {
        let fixture = Fixture::new("ignored");
        fixture.dir("target");
        fixture.file("target/should-not-appear.rs", "x");
        fixture.dir("node_modules");
        fixture.file("node_modules/pkg.js", "x");
        fixture.file("kept.rs", "x");

        let result = collect(&fixture.path, MAX_FILES).expect("collect");
        assert_eq!(result.len(), 1);
        assert!(result[0].ends_with("kept.rs"));
    }

    #[test]
    fn collect_does_not_follow_symlinked_directories() {
        let fixture = Fixture::new("symlink");
        fixture.dir("real");
        fixture.file("real/inside.rs", "x");
        let link = fixture.path.join("link");
        symlink(fixture.path.join("real"), &link).expect("create symlink");
        fixture.file("top.rs", "x");

        let result = collect(&fixture.path, MAX_FILES).expect("collect");
        assert!(!result.iter().any(|path| path.contains("/link/")));
        assert!(result.iter().any(|path| path.ends_with("top.rs")));
    }

    #[test]
    fn collect_caps_and_stops() {
        let fixture = Fixture::new("cap");
        for index in 0..5 {
            fixture.file(&format!("{index}.txt"), "x");
        }
        let result = collect(&fixture.path, 2).expect("collect");
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn collect_rejects_non_directory_root() {
        let fixture = Fixture::new("nondir");
        fixture.file("file.txt", "x");
        let file = fixture.path.join("file.txt");
        let error = collect(&file, MAX_FILES).expect_err("non-dir must fail");
        assert!(error.contains("not a directory"));
    }
}

#[cfg(test)]
mod file_ops_tests {
    use super::*;
    use std::env;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    struct Fixture {
        path: PathBuf,
    }

    impl Fixture {
        fn new(label: &str) -> Self {
            let unique = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = env::temp_dir().join(format!(
                "quarry-fileops-{label}-{}-{unique}",
                std::process::id()
            ));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).expect("create fixture directory");
            Self { path }
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn separator_in_name_is_refused() {
        let fixture = Fixture::new("sep");
        let root = fixture.path.to_string_lossy().into_owned();
        let err = create_file(root.clone(), root.clone(), "a/b".to_string()).unwrap_err();
        assert!(err.contains("path separator"), "{err}");
    }

    #[test]
    fn path_outside_root_is_refused() {
        let fixture = Fixture::new("outside");
        let root = fixture.path.to_string_lossy().into_owned();
        let outside = env::temp_dir().join("elsewhere.txt");
        let err = delete_path(root.clone(), outside.to_string_lossy().into_owned()).unwrap_err();
        assert_eq!(err, "path is outside the project root");
    }

    #[test]
    fn existing_target_is_refused() {
        let fixture = Fixture::new("exists");
        let root = fixture.path.to_string_lossy().into_owned();
        fs::write(fixture.path.join("x.txt"), b"").unwrap();
        let err = create_file(root.clone(), root.clone(), "x.txt".to_string()).unwrap_err();
        assert!(err.contains("already exists"), "{err}");
    }

    #[test]
    fn create_rename_delete_round_trip() {
        let fixture = Fixture::new("roundtrip");
        let root = fixture.path.to_string_lossy().into_owned();
        let created = create_file(root.clone(), root.clone(), "a.txt".to_string()).unwrap();
        assert!(PathBuf::from(&created).exists());
        let renamed = rename_path(root.clone(), created.clone(), "b.txt".to_string()).unwrap();
        assert!(!PathBuf::from(&created).exists());
        assert!(PathBuf::from(&renamed).exists());
        delete_path(root.clone(), renamed.clone()).unwrap();
        assert!(!PathBuf::from(&renamed).exists());
    }

    #[test]
    fn deleting_missing_is_refused() {
        let fixture = Fixture::new("missing");
        let root = fixture.path.to_string_lossy().into_owned();
        let target = fixture.path.join("nope.txt");
        let err = delete_path(root, target.to_string_lossy().into_owned()).unwrap_err();
        assert!(err.contains("does not exist"), "{err}");
    }

    #[test]
    fn deleting_root_is_refused() {
        let fixture = Fixture::new("rootdel");
        let root = fixture.path.to_string_lossy().into_owned();
        let err = delete_path(root.clone(), root).unwrap_err();
        assert_eq!(err, "cannot delete the project root");
    }
}
