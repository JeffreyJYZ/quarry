#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};
pub use std::process::{Command, Stdio};
pub use std::thread;
pub use std::time::{Duration, Instant, SystemTime};

pub(crate) use crate::types::{ProjectInfo, ProjectKind};

use super::*;

/// Files whose change makes a CMake configure describe a different tree than the database does.
pub const CONFIGURE_MARKERS: [&str; 2] = ["CMakeLists.txt", "CMakePresets.json"];

/// Levels below the source root searched for a nested `CMakeLists.txt`; `add_subdirectory` targets
/// change the flags of the translation units below them, so a root-only check misses them.
pub const MARKER_DEPTH: usize = 2;

/// A configure that has produced nothing after this long is treated as a failure, so a broken
/// toolchain cannot hold a language-server start open.
pub const CONFIGURE_TIMEOUT: Duration = Duration::from_secs(60);

/// Whether a changed path is a file whose edit invalidates the compile database.
pub fn is_configure_marker(path: &Path) -> bool {
    path.file_name()
        .map(|name| name.to_string_lossy())
        .is_some_and(|name| CONFIGURE_MARKERS.contains(&name.as_ref()))
}

/// Every configure marker at or near `root`, so one timestamp comparison covers the tree.
pub fn configure_markers(root: &Path) -> Vec<PathBuf> {
    let mut markers = Vec::new();
    collect_markers(root, 0, &mut markers);
    markers
}

fn collect_markers(dir: &Path, depth: usize, markers: &mut Vec<PathBuf>) {
    for name in CONFIGURE_MARKERS {
        let candidate = dir.join(name);
        if candidate.is_file() {
            markers.push(candidate);
        }
    }
    if depth >= MARKER_DEPTH {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if crate::ignore::is_dir(&name) {
            continue;
        }
        collect_markers(&path, depth + 1, markers);
    }
}

/// Whether the database is missing or older than a marker that describes the tree.
///
/// A marker edited after the last configure means the database no longer says how this tree builds:
/// a new include directory, a new define, a preset that changed the compiler. Analysing against it
/// reports errors the build does not have, which is the failure this session start exists to avoid.
pub fn database_is_stale(database_dir: &Path, root: &Path) -> bool {
    let Ok(metadata) = fs::metadata(database_dir.join(crate::project::DATABASE_FILE)) else {
        return true;
    };
    let Ok(database_time) = metadata.modified() else {
        return true;
    };
    configure_markers(root)
        .iter()
        .filter_map(|marker| fs::metadata(marker).ok()?.modified().ok())
        .any(|marker_time| marker_time > database_time)
}

/// Reconfigure when the database is stale; true when it describes the tree afterwards.
///
/// Serialised process-wide: a burst of saves delivers several change batches, and two configures in
/// one build directory at once would race over its cache and generated files.
pub fn refresh(root: &Path, database_dir: &Path) -> bool {
    let _guard = configure_lock();
    if !database_is_stale(database_dir, root) {
        return true;
    }
    configure(root, database_dir).is_ok() && !database_is_stale(database_dir, root)
}

/// The process-wide configure slot.
fn configure_lock() -> std::sync::MutexGuard<'static, ()> {
    static SLOT: std::sync::Mutex<()> = std::sync::Mutex::new(());
    SLOT.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// `cmake -S <root> -B <database dir> -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`.
///
/// The build type is only set for a directory that has never been configured: reconfiguring an
/// existing Release tree must not flip it to Debug just to export the database.
pub fn configure(root: &Path, database_dir: &Path) -> Result<(), String> {
    let mut command = crate::resolve::command(crate::build_task::CMAKE_PROGRAM)?;
    command
        .args(argv(root, database_dir))
        .current_dir(root)
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    let stderr = run_bounded(command, CONFIGURE_TIMEOUT)?;
    if stderr.success {
        return Ok(());
    }
    Err(format!("cmake configure failed: {}", tail(&stderr.text)))
}

/// The configure command line, program excluded.
pub fn argv(root: &Path, database_dir: &Path) -> Vec<String> {
    let mut argv = vec![
        "-S".to_string(),
        root.display().to_string(),
        "-B".to_string(),
        database_dir.display().to_string(),
        "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON".to_string(),
    ];
    if !database_dir.join("CMakeCache.txt").is_file() {
        argv.push(format!(
            "-DCMAKE_BUILD_TYPE={}",
            crate::build_task::CMAKE_CONFIG_DEBUG
        ));
    }
    argv
}

/// What a bounded run reported.
pub struct Bounded {
    pub success: bool,
    pub text: String,
}

/// Run a command with a deadline, capturing stderr.
///
/// `Command::output` waits forever, and a configure that blocks on a missing toolchain would keep a
/// language server from ever starting. The child is killed at the deadline; its stderr is read on its
/// own thread so a chatty configure cannot fill the pipe and deadlock.
pub fn run_bounded(mut command: Command, timeout: Duration) -> Result<Bounded, String> {
    let mut child = command
        .spawn()
        .map_err(|error| format!("cannot run cmake: {error}"))?;
    let stderr = child.stderr.take();
    let reader = thread::spawn(move || {
        use std::io::Read;
        let mut text = String::new();
        if let Some(mut pipe) = stderr {
            let _ = pipe.read_to_string(&mut text);
        }
        text
    });

    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(_) => break None,
        }
    };
    let text = reader.join().unwrap_or_default();
    let success = status.is_some_and(|status| status.success());
    if status.is_none() {
        return Err(format!(
            "cmake configure timed out after {}s",
            timeout.as_secs()
        ));
    }
    Ok(Bounded { success, text })
}

/// The last non-empty stderr line, cut to a status-bar-sized message.
pub fn tail(text: &str) -> String {
    let line = text
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .map(str::trim)
        .unwrap_or("no output");
    line.chars().take(300).collect()
}
