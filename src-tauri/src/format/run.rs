#![allow(unused_imports)]

pub use std::env;
pub use std::fs;
pub use std::io::Write;
pub use std::path::Path;
pub use std::process::{Command, Stdio};
pub use std::thread;
use std::time::{Duration, Instant};

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
    let mut stdout_pipe = child.stdout.take();
    let mut stderr_pipe = child.stderr.take();

    // The source goes out on its own thread: a large document must not fill the pipe while the child
    // is filling stdout, which would deadlock both sides.
    let payload = text.as_bytes().to_vec();
    let writer = thread::spawn(move || {
        let _ = stdin.write_all(&payload);
        // Dropping `stdin` closes the pipe, so the formatter sees end of input.
    });

    // Bounded wait: a hung formatter must not block forever.
    let deadline = Instant::now() + Duration::from_secs(30);
    let exit_status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = writer.join();
                    return Err(format!("formatter timed out after 30s: {binary}"));
                }
                thread::sleep(Duration::from_millis(50));
            }
            Err(error) => {
                let _ = writer.join();
                return Err(format!("cannot wait for {binary}: {error}"));
            }
        }
    };
    let _ = writer.join();

    use std::io::Read;
    let mut stdout_buf = Vec::new();
    let mut stderr_buf = Vec::new();
    if let Some(mut s) = stdout_pipe.take() {
        let _ = s.read_to_end(&mut stdout_buf);
    }
    if let Some(mut s) = stderr_pipe.take() {
        let _ = s.read_to_end(&mut stderr_buf);
    }

    if !exit_status.success() {
        return Err(format!(
            "{binary} failed ({}): {}",
            exit_status,
            stderr_detail(&String::from_utf8_lossy(&stderr_buf))
        ));
    }

    let formatted = String::from_utf8_lossy(&stdout_buf).into_owned();
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
        return super::tool_search::find_on_path(TAPLO)
            .or_else(|| super::tool_search::find_on_path("taplo-cli"))
            .or_else(|| find_with_xcrun(TAPLO));
    }
    super::tool_search::find_on_path(name).or_else(|| find_with_xcrun(name))
}
