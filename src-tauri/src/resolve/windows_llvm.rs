//! Where a Windows install keeps the toolchain a Dock-less launch cannot see.
//!
//! A Start-menu launch inherits the system `PATH`, not the one a developer's shell builds, so LLVM
//! installed beside the product (`%ProgramFiles%\LLVM`) and the LLVM Visual Studio ships inside itself
//! (`…\VC\Tools\Llvm\<arch>\bin`, where `lldb-dap.exe` lives) are both absent from it. Listing the
//! macOS directories on Windows was worse than useless: it made the search look complete while never
//! finding the adapter the image actually installed.

use std::env;
use std::fs;
use std::path::PathBuf;

/// Every Windows fallback directory, in the order they are worth trying.
pub fn directories() -> Vec<PathBuf> {
    let mut directories = Vec::new();
    for variable in ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"] {
        let Some(root) = env::var_os(variable) else {
            continue;
        };
        directories.push(PathBuf::from(&root).join("LLVM").join("bin"));
    }

    if let Some(home) = env::var_os("USERPROFILE").map(PathBuf::from) {
        directories.push(home.join(".cargo").join("bin"));
        directories.push(home.join(".local").join("bin"));
    }
    if let Some(local) = env::var_os("LOCALAPPDATA") {
        directories.push(
            PathBuf::from(local)
                .join("Programs")
                .join("LLVM")
                .join("bin"),
        );
    }

    directories.extend(visual_studio_llvm());
    directories
}

/// The LLVM directories Visual Studio ships inside itself.
///
/// The layout is `…\Microsoft Visual Studio\<year>\<edition>\VC\Tools\Llvm\<arch>\bin`, with one
/// directory per year and per edition, so the years and editions are read off disk rather than
/// guessed: an image with only 2022 installed must not be searched for a 2026 that is not there.
fn visual_studio_llvm() -> Vec<PathBuf> {
    let mut found = Vec::new();
    for variable in ["ProgramFiles", "ProgramW6432"] {
        let Some(root) = env::var_os(variable) else {
            continue;
        };
        let studio = PathBuf::from(root).join("Microsoft Visual Studio");
        let Ok(years) = fs::read_dir(&studio) else {
            continue;
        };
        for year in years.flatten() {
            let Ok(editions) = fs::read_dir(year.path()) else {
                continue;
            };
            for edition in editions.flatten() {
                let llvm = edition.path().join("VC").join("Tools").join("Llvm");
                let Ok(architectures) = fs::read_dir(&llvm) else {
                    continue;
                };
                for architecture in architectures.flatten() {
                    found.push(architecture.path().join("bin"));
                }
            }
        }
    }
    found
}
