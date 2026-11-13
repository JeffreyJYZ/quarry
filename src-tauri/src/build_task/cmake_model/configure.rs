//! One configure, run by both the build and the language-server hand-off.
//!
//! A CMake configure is three things in a fixed order, and every caller needs all three: the file
//! API query written before CMake reads it, the plan's own configure spawned, and the compiler
//! database synthesised from the reply on success where the generator writes none (Xcode, Visual
//! Studio, Ninja Multi-Config). The hand-off used to run only the middle one, so a generator that
//! writes no `compile_commands.json` left clangd with nothing to read; this is the whole sequence,
//! once, so the session and the build cannot drift apart again.
//!
//! Only the spawn differs: the build runs it under its cancellation slot and reports the output in
//! the build panel, while the hand-off bounds it so a broken toolchain cannot hold a language-server
//! start open. A failure is a result here — a failing configure is `Ok` with `success: false` — and
//! only a configure that cannot be spawned at all is `Err`.

#![allow(unused_imports)]

pub use std::path::Path;

use super::*;

/// What one runner reported: the exit verdict and the output it captured.
pub struct ConfigureRun {
    pub success: bool,
    pub stopped: bool,
    pub text: String,
}

/// One configure, and every line worth reporting about it in the order they happened.
pub struct Configured {
    pub success: bool,
    pub stopped: bool,
    pub text: String,
    /// The query error, a failed configure, and what the synthesis wrote.
    pub notes: Vec<String>,
}

/// What a caller knows before the configure starts.
pub struct ConfigureRequest<'a> {
    /// The tree the query and the synthesized database belong to.
    pub build_root: &'a Path,
    /// The plan's configure, program first.
    pub argv: &'a [String],
    /// The configuration this build uses, so the database describes that one and not Debug.
    pub configuration: &'a str,
    /// Whether this tree ever finished a configure, so a failure can say the old model stands.
    pub had_previous: bool,
}

/// Configure one tree: query first, the plan's configure, then the database from the reply.
pub fn configure_tree<F>(request: ConfigureRequest<'_>, run: F) -> Result<Configured, String>
where
    F: FnOnce(&[String]) -> Result<ConfigureRun, String>,
{
    let mut notes: Vec<String> = Vec::new();
    // The query has to exist before the configure that answers it: CMake writes only the objects a
    // client asked for, and it reads the query once, as the configure starts.
    if let Err(error) = write_query(request.build_root) {
        notes.push(error);
    }

    let run = run(request.argv)?;

    // The reply and the model on disk are the last configure that succeeded, so a failure says so
    // instead of letting the old targets pass for current ones. The database is left alone: a
    // half-built model, or none, is worse for analysis than the previous one.
    if !run.success && !run.stopped && request.had_previous {
        notes.push(format!(
            "the configure failed, so {} still holds the model of its last successful configure",
            request.build_root.display()
        ));
    }

    // Read only after a configure that succeeded: a failed one can leave a reply half written, and
    // a database built from half a project is worse than the previous one still on disk.
    if run.success && !run.stopped {
        match synthesize_database(request.build_root, request.configuration) {
            Ok(Some(written)) => notes.push(written.note()),
            Ok(None) => {}
            Err(why) => notes.push(format!(
                "no compiler database from the CMake file API: {why}"
            )),
        }
    }

    Ok(Configured {
        success: run.success,
        stopped: run.stopped,
        text: run.text,
        notes,
    })
}
