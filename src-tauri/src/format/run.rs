#![allow(unused_imports)]

pub use std::env;
pub use std::fs;
pub use std::io::Write;
pub use std::path::Path;
pub use std::process::{Command, Stdio};
pub use std::thread;

use super::*;

/// The nearest `.clang-format` above a file, following the loader clang-format itself uses.
pub fn nearest_clang_format(path: &str) -> Option<String> {
    let file = Path::new(path);
    let mut current = file.parent();
    while let Some(dir) = current {
        let candidate = dir.join(".clang-format");
        if let Ok(text) = fs::read_to_string(&candidate) {
            return Some(text);
        }
        current = dir.parent();
    }
    None
}
/// Runs the formatter over stdin and returns stdout. Called on a blocking thread.
pub fn run(formatter: Formatter, root: &str, path: &str, text: &str) -> Result<String, String> {
    let program = program_for(formatter);
    let binary = resolve(program).ok_or_else(|| missing(program))?;

    let mut command = Command::new(&binary);
    command
        .args(argv(formatter, path))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // rustfmt reads its configuration from the crate it is standing in; a formatter outside a project
    // root would use the defaults instead of the project's `rustfmt.toml`.
    if formatter == Formatter::Rustfmt && Path::new(root).is_dir() {
        command.current_dir(root);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("cannot run {binary}: {error}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| format!("cannot write to {binary}: stdin is not available"))?;

    // The source goes out on its own thread: a large document must not fill the pipe while the child
    // is filling stdout, which would deadlock both sides.
    let payload = text.as_bytes().to_vec();
    let writer = thread::spawn(move || {
        let _ = stdin.write_all(&payload);
        // Dropping `stdin` closes the pipe, so the formatter sees end of input.
    });

    let output = child
        .wait_with_output()
        .map_err(|error| format!("cannot wait for {binary}: {error}"))?;
    // A formatter that exits early closes the pipe; the write error is already reflected in the status.
    let _ = writer.join();

    if !output.status.success() {
        return Err(format!(
            "{binary} failed ({}): {}",
            output.status,
            stderr_detail(&String::from_utf8_lossy(&output.stderr))
        ));
    }

    let formatted = String::from_utf8_lossy(&output.stdout).into_owned();
    if formatted.is_empty() {
        return Err(format!("{binary} produced nothing ({path})"));
    }

    Ok(formatted)
}

pub fn program_for(formatter: Formatter) -> &'static str {
    match formatter {
        Formatter::Rustfmt => RUSTFMT,
        Formatter::ClangFormat | Formatter::None => CLANG_FORMAT,
        Formatter::Taplo => TAPLO,
    }
}

/// Naming the tool and the install path is the whole point: a GUI launch cannot see `PATH`, so the
/// message has to say where the tool comes from.
pub fn missing(program: &str) -> String {
    if program == RUSTFMT {
        format!("{program} is not installed: run `rustup component add rustfmt`")
    } else if program == TAPLO {
        "no formatter for .toml: install taplo-cli".to_string()
    } else {
        format!(
            "{program} is not installed: install the Xcode command line tools \
             (`xcode-select --install`) or run `brew install clang-format`"
        )
    }
}

/// First non-empty stderr line, trimmed and cut to the status-bar limit.
pub fn stderr_detail(stderr: &str) -> String {
    let line = stderr
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("no stderr output");
    truncate(line.trim(), STDERR_LIMIT)
}

pub fn truncate(text: &str, limit: usize) -> String {
    text.chars().take(limit).collect()
}

/// `PATH` first, then `xcrun`: `clang-format` lives in the Xcode toolchain, which a GUI-launched app
/// cannot see on its inherited `PATH`.
pub fn resolve(name: &str) -> Option<String> {
    if name == TAPLO {
        return find_on_path(TAPLO)
            .or_else(|| find_on_path("taplo-cli"))
            .or_else(|| find_with_xcrun(TAPLO));
    }
    find_on_path(name).or_else(|| find_with_xcrun(name))
}

/// Walk `PATH` by hand rather than shelling out, so a directory is never interpreted or expanded.
pub fn find_on_path(name: &str) -> Option<String> {
    let path = env::var_os("PATH")?;

    env::split_paths(&path).find_map(|dir| {
        if dir.as_os_str().is_empty() {
            return None;
        }

        let candidate = dir.join(name);
        is_executable(&candidate).then(|| candidate.to_string_lossy().into_owned())
    })
}

#[cfg(unix)]
pub fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;

    // `metadata` follows symlinks, so a link to a regular file counts as a hit.
    fs::metadata(path)
        .map(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
pub fn is_executable(path: &Path) -> bool {
    fs::metadata(path)
        .map(|meta| meta.is_file())
        .unwrap_or(false)
}
