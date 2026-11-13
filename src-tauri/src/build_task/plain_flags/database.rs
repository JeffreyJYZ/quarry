//! Writing the database a plain project never had.
//!
//! The consumer contract is the file, not a side channel: the hand-off passes
//! `--compile-commands-dir`, and clangd reads `compile_commands.json` there. So the flags
//! [`build_flags`] derives are written as one entry per source, into the tree the plain build
//! already writes its binary in, and the file records exactly the command that build runs.
//!
//! Nothing is written for a project that already describes itself: a real database is the
//! generator's own answer and stays authoritative, and `compile_flags.txt`/`.clangd` are the user's
//! instruction to clangd, which a database of ours would replace rather than honour. Nothing is
//! rewritten either when the file already holds the same entries, so starting a session does not
//! churn a file clangd is watching.

#![allow(unused_imports)]

pub use std::fs;
pub use std::path::{Path, PathBuf};

use super::*;

use crate::build_task::{external, external_str};

/// What one synthesis wrote — or found already written — for the note a build reports.
#[derive(Clone, Debug, PartialEq)]
pub struct PlainSynthesis {
    pub path: PathBuf,
    pub files: usize,
    /// The drivers these entries name, in source order and without repeats.
    pub compiler: String,
    pub flags: String,
    /// Whether this call wrote the file; false when it already held these entries.
    pub written: bool,
}

impl PlainSynthesis {
    /// One line naming what was written and with which flags, when this call wrote it.
    pub fn note(&self) -> Option<String> {
        self.written.then(|| {
            format!(
                "wrote {} for the plain build ({} entries: {} {})",
                self.path.display(),
                self.files,
                self.compiler,
                self.flags
            )
        })
    }
}

/// Write the database a plain project cannot write itself, or leave its own description alone.
///
/// `Ok(Some(_))` means a database now describes this project at `path`, whether this call wrote it
/// or found it current — the language-server hand-off needs that directory either way, and
/// [`PlainSynthesis::note`] is what says a file was written. `Ok(None)` means nothing describes the
/// project: it has a real database, states its own flags for clangd, or names no source.
pub fn synthesize_plain_database(
    root: &Path,
    sources: &[PathBuf],
) -> Result<Option<PlainSynthesis>, String> {
    if sources.is_empty()
        || crate::project::locate_database(root, root).is_some()
        || own_instruction(root).is_some()
    {
        return Ok(None);
    }

    let flags = PlainFlags::for_project(root, sources);
    let entries = entries(root, &flags, sources);
    let encoded = encode_database(&entries)?;
    let directory = plain_clang_build_dir(root);
    let path = directory.join(DATABASE_FILE);
    // A file clangd is watching is not rewritten with what it already holds.
    let written = fs::read_to_string(&path).ok().as_deref() != Some(encoded.as_str());
    if written {
        fs::create_dir_all(&directory)
            .map_err(|error| format!("cannot create {}: {error}", directory.display()))?;
        write_database(&path, &entries)?;
    }
    Ok(Some(PlainSynthesis {
        path,
        files: entries.len(),
        compiler: drivers(&flags, sources),
        flags: flags.summary_for(sources),
        written,
    }))
}

/// The drivers these sources compile with, in source order and named once each.
fn drivers(flags: &PlainFlags, sources: &[PathBuf]) -> String {
    let mut names: Vec<&'static str> = Vec::new();
    for source in sources {
        let driver = flags.compiler_for(source);
        if !names.contains(&driver) {
            names.push(driver);
        }
    }
    names.join(", ")
}

/// One entry per source, each recording the command this project's build compiles it with.
///
/// The driver and the standard come from the source's own extension, so a `.c` file in a project
/// that also holds C++ is recorded as C. clangd reads this file and has nothing else to decide the
/// language from, and a C++ command for a C file is an error it reports on every line that matters.
fn entries(root: &Path, flags: &PlainFlags, sources: &[PathBuf]) -> Vec<CompileEntry> {
    sources
        .iter()
        .map(|source| {
            let file = external(&root.join(source));
            let mut arguments = vec![flags.compiler_for(source).to_string()];
            arguments.extend(flags.command_flags_for(source));
            arguments.push("-c".to_string());
            arguments.push(file.clone());
            CompileEntry {
                directory: external(root),
                file,
                arguments,
            }
        })
        .collect()
}
