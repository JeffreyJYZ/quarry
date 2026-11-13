#![allow(unused_imports)]

pub use std::collections::HashSet;
pub use std::path::{Path, PathBuf};

use super::*;

/// Programs clangd should query for the project's system include paths.
///
/// clangd trusts a driver whose name looks like clang; a CMake project configured with Apple's `cc`,
/// Homebrew's g++, or a cross toolchain records a driver it will not query, and without the query it
/// cannot find libc++'s or the sysroot's headers. Only real compilers are named: a launcher such as
/// `ccache` in front of the command answers `--version` for itself, which teaches clangd nothing, so
/// the driver behind it is taken instead.
pub fn compiler_drivers(database: &Path) -> Vec<String> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut drivers: Vec<String> = Vec::new();
    for entry in read_entries(database) {
        let Some(program) = compiler_token(&entry.argv) else {
            continue;
        };
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

/// The first word of a command that is a compiler rather than the launcher in front of it.
///
/// A tree compiled through `ccache` or a wrapper script records the launcher first, so the driver
/// clangd can query is the next word after it. An option ends the command's own words, so a source
/// or header named after a compiler is never mistaken for the driver.
fn compiler_token(argv: &[String]) -> Option<&str> {
    argv.iter()
        .take_while(|token| !token.starts_with('-'))
        .find(|token| is_compiler(token))
        .map(String::as_str)
}

/// Whether a program name is a C/C++ compiler rather than a launcher or a build tool.
///
/// `cl.exe` is MSVC's driver and names no family below, so a Visual Studio tree's record was
/// filtered out and clangd was never told to query the compiler that tree was built with. The
/// `.exe` suffix is not part of the name: the same driver is `cl` under a POSIX launcher.
pub fn is_compiler(program: &str) -> bool {
    let name = Path::new(program)
        .file_name()
        .map(|name| name.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    let stem = name.strip_suffix(".exe").unwrap_or(name.as_str());
    if stem.is_empty() {
        return false;
    }
    let families = ["clang", "gcc", "g++", "icx", "icpx"];
    if families.iter().any(|family| stem.contains(family)) {
        return true;
    }
    matches!(
        stem,
        "cc" | "c++" | "c89" | "c99" | "gcc" | "g++" | "zig" | "cl"
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
