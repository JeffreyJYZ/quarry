//! What a plain C/C++ project's compile command carries, from the project itself.
//!
//! Nothing here reads a build system: a project with none still has conventions worth honouring —
//! its own root, the `include/` directory a C/C++ layout puts public headers in, the standard its
//! language's files are written against — and the user's extra flags from `.quarry/settings.json`.
//! The plain build and the synthesised database are both built from the one answer, so a flag the
//! compiler gets is a flag clangd gets.

#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

/// The standard a C++ file compiles with when the project says nothing else.
pub const CXX_STANDARD: &str = "-std=c++20";

/// The standard a C file compiles with when the project says nothing else.
pub const C_STANDARD: &str = "-std=c17";

/// Directory a plain project conventionally keeps its public headers in.
pub const INCLUDE_DIR: &str = "include";

/// The `.quarry/settings.json` key holding a plain C/C++ build's extra flags.
///
/// A string (`"-DDEBUG=1 -DFEATURE"`) or an array of strings; either is split the way a shell would
/// split it, so a path with a space survives. It is read through the settings' own catch-all map, so
/// a save from the settings page keeps the key it never shows.
pub const CPP_FLAGS_KEY: &str = "cppFlags";

/// The flags one plain project compiles its sources with.
#[derive(Clone, Debug, PartialEq)]
pub struct PlainFlags {
    /// Whether the project compiles as C++, which decides the driver and the default standard.
    pub cxx: bool,
    /// Directories searched for a header, absolute so clangd resolves them from any file.
    pub includes: Vec<PathBuf>,
    /// Flags the project itself states, `-D` and friends, kept in the order the user wrote them.
    pub extra: Vec<String>,
}

/// The derived flags, plus where a build's own flags came from.
#[derive(Clone, Debug, PartialEq)]
pub struct BuildFlags {
    pub plain: PlainFlags,
    /// What the compiler command appends, after its fixed `-g -O0 -fno-color-diagnostics`.
    pub flags: Vec<String>,
    /// True when a real database answered, so nothing was derived and nothing may be written.
    pub from_database: bool,
}

impl PlainFlags {
    /// The flags every source of this project compiles with.
    pub fn for_project(root: &Path, sources: &[PathBuf]) -> Self {
        let mut includes = vec![root.to_path_buf()];
        let public = root.join(INCLUDE_DIR);
        if public.is_dir() {
            includes.push(public);
        }
        Self {
            cxx: sources
                .iter()
                .any(|source| source.extension().map(|ext| ext != "c").unwrap_or(true)),
            includes,
            extra: project_flags(root),
        }
    }

    /// Whether one source is C: its own extension decides, never the project's mixed set.
    ///
    /// `cxx` only says the project contains C++; a `.c` file inside it is still C, and compiling it
    /// with the C++ driver and `-std=c++20` breaks every C-only construct it uses.
    pub fn is_c(source: &Path) -> bool {
        crate::extensions::extension_of(source) == "c"
    }

    /// The driver one source compiles with.
    pub fn compiler_for(&self, source: &Path) -> &'static str {
        if Self::is_c(source) {
            "clang"
        } else {
            "clang++"
        }
    }

    /// The standard one source is compiled against when the project names none.
    pub fn standard_for(&self, source: &Path) -> &'static str {
        if Self::is_c(source) {
            C_STANDARD
        } else {
            CXX_STANDARD
        }
    }

    /// What the build command and a database entry share: the searches, then the project's own flags.
    ///
    /// The standard is left out on purpose: the build command lets a project-supplied `-std=` win by
    /// appending it later, and [`Self::command_flags_for`] is what a database entry records.
    pub fn flags(&self) -> Vec<String> {
        let mut flags: Vec<String> = self
            .includes
            .iter()
            .map(|dir| format!("-I{}", dir.display()))
            .collect();
        flags.extend(self.extra.iter().cloned());
        flags
    }

    /// The flags one translation unit compiles with, its language's standard included once.
    pub fn command_flags_for(&self, source: &Path) -> Vec<String> {
        let mut flags = self.flags();
        if !flags.iter().any(|flag| flag.starts_with("-std=")) {
            flags.push(self.standard_for(source).to_string());
        }
        flags
    }

    /// The flags as one readable line, for the note a build reports.
    ///
    /// A mixed project carries one standard per language, so the line names each of them once
    /// instead of claiming the C++ one for a file compiled as C.
    pub fn summary_for(&self, sources: &[PathBuf]) -> String {
        let mut flags = self.flags();
        if !flags.iter().any(|flag| flag.starts_with("-std=")) {
            for source in sources {
                let standard = self.standard_for(source).to_string();
                if !flags.contains(&standard) {
                    flags.push(standard);
                }
            }
        }
        flags.join(" ")
    }
}

/// The flags a plain-clang build passes: a real database's when the project has one, else derived.
///
/// This is the only place the choice is made, so the build, the language-server hand-off and the
/// plan a probe reads cannot answer differently about what the project compiles with.
pub fn build_flags(root: &Path, sources: &[PathBuf]) -> BuildFlags {
    let plain = PlainFlags::for_project(root, sources);
    match crate::project::locate_database(root, root) {
        Some(directory) => BuildFlags {
            flags: crate::project::database_flags(
                &directory.join(crate::project::DATABASE_FILE),
                plain.cxx,
            ),
            plain,
            from_database: true,
        },
        None => BuildFlags {
            flags: plain.flags(),
            plain,
            from_database: false,
        },
    }
}

/// The flags this project's `.quarry/settings.json` states, as the shell would split them.
fn project_flags(root: &Path) -> Vec<String> {
    let settings = crate::settings::read_project_settings(root.display().to_string());
    let Some(value) = settings.extra.get(CPP_FLAGS_KEY) else {
        return Vec::new();
    };
    match value {
        serde_json::Value::String(text) => crate::project::split_command(text),
        serde_json::Value::Array(items) => items
            .iter()
            .filter_map(serde_json::Value::as_str)
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}
