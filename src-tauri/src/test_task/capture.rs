#![allow(unused_imports)]

pub(crate) use crate::project;
pub(crate) use crate::types::{ProjectKind, TestItem, TestReport};
pub use std::io::{BufRead, BufReader, Read};
pub use std::process::{Command, ExitStatus, Stdio};
pub use std::sync::{Arc, Mutex};
pub use std::thread;
pub use std::time::{Duration, Instant};

use super::*;

/// A finished run: the exit status plus every line in arrival order.
///
/// The two pipes are drained by threads of their own, so a large log never fills a pipe buffer and
/// stalls the child, and the relative order of the streams is preserved closely enough to attribute
/// a `Running …` header to the tests that follow it.
#[derive(Debug)]
pub struct Captured {
    pub(crate) status: ExitStatus,
    pub(crate) lines: Vec<Line>,
}
/// Runs cargo with the given arguments and kills it once `timeout` elapses.
pub fn capture(
    operation: &str,
    build_root: &str,
    args: &[&str],
    timeout: Duration,
) -> Result<Captured, String> {
    let program = cargo_program();
    capture_program(operation, build_root, &program, args, timeout)
}

/// Runs one program in `cwd` with the given arguments and kills it once `timeout` elapses.
///
/// The program is a path for a test binary and a bare tool name for cargo, so a name without a
/// separator goes through the shared resolver (a GUI launch has no usable `PATH`) while a path is
/// spawned as written.
pub fn capture_program(
    operation: &str,
    cwd: &str,
    program: &str,
    args: &[&str],
    timeout: Duration,
) -> Result<Captured, String> {
    let mut child = program_command(program)?
        .current_dir(cwd)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("cannot {operation} in {cwd}: cannot start {program}: {error}"))?;

    let sink: Arc<Mutex<Vec<Line>>> = Arc::new(Mutex::new(Vec::new()));
    let stdout = child
        .stdout
        .take()
        .map(|stream| spawn_reader(stream, false, &sink));
    let stderr = child
        .stderr
        .take()
        .map(|stream| spawn_reader(stream, true, &sink));

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {}
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "cannot {operation} in {cwd}: waiting for {program} failed: {error}"
                ));
            }
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            break None;
        }
        thread::sleep(WAIT_INTERVAL);
    };

    for reader in [stdout, stderr].into_iter().flatten() {
        let _ = reader.join();
    }

    let Some(status) = status else {
        return Err(timeout_error(operation, timeout, program));
    };
    let lines = sink
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .clone();
    Ok(Captured { status, lines })
}

/// A command for a test binary path, or for a tool name found through the shared resolver.
///
/// A program carrying a separator is a path the project configured, so it is spawned as written;
/// a bare name is a tool (`cargo`), which a GUI launch can only find through the resolver.
pub fn program_command(program: &str) -> Result<Command, String> {
    if program.contains('/') || program.contains('\\') {
        return Ok(Command::new(program));
    }
    crate::resolve::command(program)
}

/// Drains one pipe into the shared sink until the child closes it.
pub fn spawn_reader<R>(
    stream: R,
    stderr: bool,
    sink: &Arc<Mutex<Vec<Line>>>,
) -> thread::JoinHandle<()>
where
    R: Read + Send + 'static,
{
    let sink = Arc::clone(sink);
    thread::spawn(move || {
        let mut reader = BufReader::new(stream);
        let mut buffer = Vec::new();
        loop {
            buffer.clear();
            match reader.read_until(b'\n', &mut buffer) {
                Ok(0) | Err(_) => return,
                Ok(_) => {
                    let line = String::from_utf8_lossy(&buffer);
                    let text = line.trim_end_matches(['\n', '\r']).to_string();
                    let mut lines = sink.lock().unwrap_or_else(|error| error.into_inner());
                    lines.push(Line { text, stderr });
                }
            }
        }
    })
}

/// `CARGO` from the environment when set, else the shim on `PATH`.
pub fn cargo_program() -> String {
    std::env::var(CARGO_ENV)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_CARGO.to_string())
}

/// Both streams joined in arrival order, for the line-oriented parsers.
pub fn merged_text(lines: &[Line]) -> String {
    line_texts(lines).join("\n")
}

pub fn line_texts(lines: &[Line]) -> Vec<String> {
    lines.iter().map(|line| line.text.clone()).collect()
}
