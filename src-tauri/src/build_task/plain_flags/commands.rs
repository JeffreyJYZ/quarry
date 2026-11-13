//! The commands a plain C/C++ build runs: one per compiler, then the link that joins them.
//!
//! A project whose sources share one language compiles and links in one command, which is what it
//! always did. A mixed C/C++ project cannot: one `-std` and one driver would compile its `.c` files
//! as C++, and anything C-only in them stops building. So each source is compiled by the driver of
//! its own language and the objects are linked once, by the C++ driver when any object came from
//! C++ — which is also the driver whose runtime `extern "C"` code needs.
//!
//! Nothing here decides flags: [`super::PlainFlags`] and [`super::build_flags`] answer those, and
//! this module only says how many commands carry them and in which order.

#![allow(unused_imports)]

pub use std::path::{Path, PathBuf};

use super::*;

/// The driver that links a project with a C++ translation unit.
pub const CXX_LINK_DRIVER: &str = "clang++";

/// The flags both a compile step and the link pass, matching the single-command build.
pub const FIXED_FLAGS: [&str; 3] = ["-g", "-O0", "-fno-color-diagnostics"];

/// The subdirectory object files go in, below the plain build directory.
pub const OBJECT_DIR: &str = "obj";

/// One command a plain build runs, program first in `argv`.
#[derive(Clone, Debug, PartialEq)]
pub struct PlainCommand {
    pub program: String,
    pub argv: Vec<String>,
}

/// Whether these sources need more than one compiler.
pub fn mixed_languages(sources: &[PathBuf]) -> bool {
    sources.iter().any(|source| PlainFlags::is_c(source))
        && sources.iter().any(|source| !PlainFlags::is_c(source))
}

/// Where one source's object file goes: its own relative path as a name, so two `main` files in
/// different directories cannot collide.
pub fn object_path(build_dir: &Path, source: &Path) -> PathBuf {
    let name = source.display().to_string().replace(['/', '\\'], "-");
    build_dir.join(OBJECT_DIR).join(format!("{name}.o"))
}

/// Every command a plain build runs, in the order it runs them.
///
/// A database the project wrote outranks this derivation, so a project that already describes
/// itself keeps the single command its own flags produced and nothing is split on its behalf.
pub fn plain_build_commands(
    root: &str,
    name: &str,
    sources: &[PathBuf],
    flags: &BuildFlags,
) -> Vec<PlainCommand> {
    if flags.from_database || !mixed_languages(sources) {
        let argv = plain_clang_argv_with(root, name, sources, &flags.flags);
        return vec![PlainCommand {
            program: argv[0].clone(),
            argv,
        }];
    }
    let build_dir = plain_clang_build_dir(Path::new(root));
    let objects: Vec<PathBuf> = sources
        .iter()
        .map(|source| object_path(&build_dir, source))
        .collect();
    let mut commands: Vec<PlainCommand> = sources
        .iter()
        .zip(&objects)
        .map(|(source, object)| {
            let mut argv = vec![flags.plain.compiler_for(source).to_string()];
            argv.extend(flags.plain.command_flags_for(source));
            argv.extend(FIXED_FLAGS.iter().map(|flag| flag.to_string()));
            argv.push("-c".to_string());
            argv.push(source.display().to_string());
            argv.push("-o".to_string());
            argv.push(object.display().to_string());
            PlainCommand {
                program: argv[0].clone(),
                argv,
            }
        })
        .collect();
    let mut link = vec![CXX_LINK_DRIVER.to_string()];
    link.extend(FIXED_FLAGS.iter().map(|flag| flag.to_string()));
    link.push("-o".to_string());
    link.push(build_dir.join(name).display().to_string());
    link.extend(objects.iter().map(|object| object.display().to_string()));
    commands.push(PlainCommand {
        program: link[0].clone(),
        argv: link,
    });
    commands
}
