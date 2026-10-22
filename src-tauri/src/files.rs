//! Fast file listing for quick-open.
//!
//! Contract: list project files once, honour the same ignore set as search, and never walk into
//! `target`, `node_modules`, `dist`, `.git` or `.quarry`.

use std::fs;
use std::path::{Path, PathBuf};

/// Cap on returned files; the UI filters what it receives.
pub const MAX_FILES: usize = 20_000;

/// Directories that are never descended into.
const IGNORED_NAMES: [&str; 5] = ["target", "node_modules", "dist", ".git", ".quarry"];

/// Whether `name` is one of the directories the walk skips.
fn is_ignored(name: &str) -> bool {
    IGNORED_NAMES.contains(&name)
}

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
            if IGNORED_NAMES.contains(&name.as_ref()) {
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

#[cfg(test)]
mod tests {
    use super::*;
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
            assert!(is_ignored(name), "{name} should be ignored");
        }
        assert!(!is_ignored("src"));
        assert!(!is_ignored("lib"));
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
