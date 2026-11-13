//! Writing the synthesized database where clangd already looks for it.
//!
//! The honest route is the file, not a side channel: the LSP lane passes `--compile-commands-dir`
//! and clangd reads `compile_commands.json` in that directory, so a database written beside the
//! build is read by today's clangd session with no change to the server lane. CMake's model is
//! only a source of flags; the consumer contract stays the one the other generators already honour.
//!
//! A database the generator wrote is never touched. Single-config Makefiles and Ninja write
//! `compile_commands.json` themselves, from the real command lines of the compiler they run, so the
//! reply's model is not consulted there at all; only a generator that writes none (Xcode, Visual
//! Studio, Ninja Multi-Config) gets the synthesized file.

#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

pub use serde::{Deserialize, Serialize};

use super::*;

/// The file name clangd reads; the build root is the directory an LSP lane points at.
pub const DATABASE_FILE: &str = crate::project::DATABASE_FILE;

/// What one synthesis wrote, for the note a build reports.
#[derive(Clone, Debug, PartialEq)]
pub struct Synthesis {
    pub path: PathBuf,
    pub files: usize,
    pub configurations: Vec<String>,
}

impl Synthesis {
    /// One line naming what was written, and for which configurations.
    pub fn note(&self) -> String {
        format!(
            "wrote {} from the CMake file API for {} ({} entries)",
            self.path.display(),
            self.configurations.join("/"),
            self.files
        )
    }
}

/// Write the database a multi-config generator does not write, or leave a generator's own alone.
///
/// Authority is decided by the generator the reply names, not by the file's presence alone: a
/// single-config Makefiles or Ninja configure writes `compile_commands.json` itself every time, so
/// that file is left untouched, while a multi-config tree's database can only be one this function
/// wrote earlier and is refreshed with the configure that just ran.
///
/// `Ok(None)` means the generator's own database stays authoritative. An unreadable or incomplete
/// reply is `Err` so the caller can note it and keep building; nothing is written in that case, so
/// a failed configure never leaves a half-read model on disk.
pub fn synthesize_database(build_root: &Path) -> Result<Option<Synthesis>, String> {
    let reply = read_reply(build_root)?;
    let path = build_root.join(DATABASE_FILE);
    if path.is_file() && writes_compile_database(reply.generator.as_deref()) {
        return Ok(None);
    }
    let model = read_codemodel(build_root)?;
    let compilers = Compilers::load(build_root);
    let entries = compile_entries(&model, &compilers);
    if entries.is_empty() {
        return Err(format!(
            "the CMake codemodel in {} names no compilable source",
            build_root.display()
        ));
    }
    write_database(&path, &entries)?;
    Ok(Some(Synthesis {
        path,
        files: entries.len(),
        configurations: model
            .configurations
            .iter()
            .map(|configuration| configuration.name.clone())
            .collect(),
    }))
}

/// The exact text a database file holds for `entries`.
///
/// A caller that rewrites a database clangd is watching compares against this first, so an unchanged
/// file is not rewritten; the encoding stays here so both write the same bytes.
pub fn encode_database(entries: &[CompileEntry]) -> Result<String, String> {
    serde_json::to_string_pretty(entries)
        .map(|text| format!("{text}\n"))
        .map_err(|error| format!("cannot encode the compiler database: {error}"))
}

/// Write the entries as the array `compile_commands.json` is, replacing the file atomically.
///
/// clangd may be reading the directory while a build runs, so a half-written database is never
/// visible: the array goes to a sibling temporary file and is renamed over the destination.
pub fn write_database(path: &Path, entries: &[CompileEntry]) -> Result<(), String> {
    let text = encode_database(entries)?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, text)
        .map_err(|error| format!("cannot write {}: {error}", temporary.display()))?;
    fs::rename(&temporary, path).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("cannot replace {}: {error}", path.display())
    })
}
