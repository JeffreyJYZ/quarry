//! Turning compile groups into per-file flags, the way a `compile_commands.json` carries them.
//!
//! A compile group records the includes, defines and command fragments a set of sources shares; the
//! group does not carry a command line, so this module composes one: the language's compiler, the
//! fragments, then an `-I`/`-isystem` per include and a `-D` per define, then `-c <file>`.
//!
//! Every configuration contributes its own entries. Ninja Multi-Config, Xcode and Visual Studio
//! build each configuration with different flags, and a consumer that reads one entry per file
//! takes the first — Debug leads because that is the configuration CMake reports first. So the
//! database writer asks for the configuration the build is using, one entry per source.

#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

pub use serde::{Deserialize, Serialize};

use super::*;

/// One `compile_commands.json` entry: the directory the command ran in, the file, and its argv.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompileEntry {
    pub directory: String,
    pub file: String,
    pub arguments: Vec<String>,
}

/// Every entry one configuration produces.
///
/// A multi-config generator describes the same sources once per configuration with different
/// flags, and clangd reads the first entry it finds for a file. The database therefore holds the
/// configuration the build is using, so the flags analysis reads are the ones the compiler ran.
pub fn configuration_entries(
    configuration: &Configuration,
    compilers: &Compilers,
) -> Vec<CompileEntry> {
    let mut entries = Vec::new();
    for target in &configuration.targets {
        for group in &target.groups {
            for source in &group.sources {
                entries.push(compile_entry(target, group, source, compilers));
            }
        }
    }
    entries
}

/// The command line one source compiles with.
pub fn compile_entry(
    target: &Target,
    group: &CompileGroup,
    source: &Path,
    compilers: &Compilers,
) -> CompileEntry {
    let driver = compilers.driver(group.language.as_deref());
    let (include, system, define, compile_only) = match compilers.style(group.language.as_deref()) {
        // cl.exe spells every switch its own way; handing it `-I` describes a compiler this tree
        // was not built with, which is what a Visual Studio database used to record.
        DriverStyle::Msvc => ("/I", "/external:I", "/D", "/c"),
        DriverStyle::Gnu => ("-I", "-isystem", "-D", "-c"),
    };
    let mut arguments = vec![driver];
    for fragment in &group.fragments {
        arguments.extend(fragment_tokens(fragment));
    }
    for path in &group.includes {
        arguments.push(if path.system { system } else { include }.to_string());
        arguments.push(path.path.display().to_string());
    }
    for name in &group.defines {
        arguments.push(format!("{define}{name}"));
    }
    arguments.push(compile_only.to_string());
    arguments.push(source.display().to_string());

    CompileEntry {
        directory: target.build_dir.display().to_string(),
        file: source.display().to_string(),
        arguments,
    }
}

/// Split one recorded fragment into argv tokens.
///
/// CMake writes a fragment as the flags it passes, sometimes several in one string
/// (`-g -arch arm64`), so whitespace is the token boundary; a quoted run is one token, which is how
/// CMake escapes a flag whose value itself contains a space. Both quote kinds are quoting: the
/// Makefiles and Ninja generators write double quotes, while the Xcode generator records a flag
/// that carries `=` as `'-std=gnu++20'`, and leaving those quotes on the token hides the standard
/// from everything that reads the database.
pub fn fragment_tokens(fragment: &str) -> Vec<String> {
    let mut tokens: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    for character in fragment.chars() {
        match character {
            '"' | '\'' => match quote {
                Some(open) if open == character => quote = None,
                Some(_) => current.push(character),
                None => quote = Some(character),
            },
            character if character.is_whitespace() && quote.is_none() => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            character => current.push(character),
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}
