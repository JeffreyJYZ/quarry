#![allow(unused_imports)]

pub use std::collections::HashSet;
pub use std::path::{Path, PathBuf};

use super::*;

/// Programs clangd should query for the project's system include paths.
///
/// clangd trusts a driver whose name looks like clang; a CMake project configured with Apple's `cc`,
/// Homebrew's g++, or a cross toolchain records a driver it will not query, and without the query it
/// cannot find libc++'s or the sysroot's headers. Only real compilers are named: a launcher such as
/// `ccache` in front of the command answers `--version` for itself, which teaches clangd nothing.
pub fn compiler_drivers(database: &Path) -> Vec<String> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut drivers: Vec<String> = Vec::new();
    for entry in read_entries(database) {
        let Some(program) = entry.argv.first() else {
            continue;
        };
        if !is_compiler(program) {
            continue;
        }
        let Some(path) = executable(&entry, program) else {
            continue;
        };
        let text = path.to_string_lossy().into_owned();
        if seen.insert(text.clone()) {
            drivers.push(text);
        }
    }
    drivers
}

/// Whether a program name is a C/C++ compiler rather than a launcher or a build tool.
pub fn is_compiler(program: &str) -> bool {
    let name = Path::new(program)
        .file_name()
        .map(|name| name.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    if name.is_empty() {
        return false;
    }
    let families = ["clang", "gcc", "g++", "icx", "icpx"];
    if families.iter().any(|family| name.contains(family)) {
        return true;
    }
    matches!(
        name.as_str(),
        "cc" | "c++" | "c89" | "c99" | "gcc" | "g++" | "zig"
    )
}

/// The driver as an absolute path that exists, or `None`.
fn executable(entry: &CompileEntry, program: &str) -> Option<PathBuf> {
    let path = Path::new(program);
    let candidate = if path.is_absolute() {
        path.to_path_buf()
    } else {
        entry.directory.join(path)
    };
    if candidate.is_file() {
        return Some(candidate);
    }
    crate::resolve::on_path(program)
}
