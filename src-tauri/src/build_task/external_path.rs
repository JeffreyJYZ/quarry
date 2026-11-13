//! A path the way another program receives it.
//!
//! `fs::canonicalize` answers with a *verbatim* path on Windows — `\\?\C:\…` — which the Win32 file
//! APIs accept and much of MSBuild and CL does not: `cmake --build \\?\C:\…` exits non-zero where the
//! same build given `C:\…` succeeds. Rust keeps the canonical form for its own comparisons; every
//! argument handed to a child process, and every path written into a file another program reads,
//! goes through here first.
//!
//! The prefix is stripped only when it really is one: a UNC share (`\\?\UNC\server\share`) becomes
//! `\\server\share`, and a drive path (`\\?\C:\…`) loses the marker so the drive letter is first.
//! Anything else is returned unchanged, which is what makes this safe to call on a relative path.

#![allow(unused_imports)]

pub use std::path::Path;

/// Marker Windows puts in front of a canonical path.
pub const VERBATIM: &str = r"\\?\";

/// The marker in front of a canonical UNC path.
pub const VERBATIM_UNC: &str = r"\\?\UNC\";

/// A path rendered for a consumer outside this process.
pub fn external(path: &Path) -> String {
    external_str(&path.display().to_string())
}

/// A path already rendered, with the verbatim marker removed when it carries one.
pub fn external_str(path: &str) -> String {
    if let Some(rest) = path.strip_prefix(VERBATIM_UNC) {
        return format!(r"\\{rest}");
    }
    // A drive path only: `\\?\` also marks device paths, which no build tool accepts either way.
    if let Some(rest) = path.strip_prefix(VERBATIM)
        && rest.as_bytes().get(1) == Some(&b':')
    {
        return rest.to_string();
    }
    path.to_string()
}
