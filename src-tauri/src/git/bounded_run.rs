#![allow(unused_imports)]

pub use std::io::Read;
pub use std::process::{Output, Stdio};
pub use std::thread::{self, JoinHandle};
pub use std::time::{Duration, Instant};

use super::*;

/// Longest one `git` invocation may run before it is killed and the command fails.
///
/// A large repository, a held `index.lock` or a credential prompt are all "still running" as far as
/// `wait` is concerned; the panel would spin with no way out. Thirty seconds is far past any real
/// local operation, so tripping it means git itself is stuck.
pub const GIT_TIMEOUT: Duration = Duration::from_secs(30);

/// How often the wait loop looks at the child and its reader threads.
pub const GIT_POLL_INTERVAL: Duration = Duration::from_millis(10);

/// Longest command label kept in an error message.
pub const COMMAND_LABEL_LIMIT: usize = 120;

/// Runs `command` to completion, killing it once `limit` has passed.
///
/// The child's output is drained on two threads while it runs, because a command that fills a pipe
/// would otherwise block on the write and look exactly like a hung one. A tripped limit kills and
/// reaps the child, so neither the process nor the wait outlives the call; a reader thread still
/// blocked on a pipe a grandchild inherited is abandoned rather than joined, since joining it is
/// the hang this bound exists to prevent.
pub fn output_within(command: &mut Command, limit: Duration) -> Result<Output, String> {
    let label = command_label(command);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|error| format!("cannot run {label}: {error}"))?;
    let stdout = drain(child.stdout.take());
    let stderr = drain(child.stderr.take());
    let deadline = Instant::now() + limit;

    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {}
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("cannot wait for {label}: {error}"));
            }
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(stalled(&label, limit));
        }
        thread::sleep(GIT_POLL_INTERVAL);
    };

    Ok(Output {
        status,
        stdout: finish(stdout, deadline, &label)?,
        stderr: finish(stderr, deadline, &label)?,
    })
}

/// The error a user sees when a command outlives its bound, naming it and the bound.
pub fn stalled(label: &str, limit: Duration) -> String {
    format!(
        "{label} did not finish within {}s and was stopped",
        limit.as_secs_f64()
    )
}

/// `git status --porcelain=v2 …`, so the message says which command stalled.
pub fn command_label(command: &Command) -> String {
    let program = command.get_program().to_string_lossy().into_owned();
    let mut label = Path::new(&program)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or(program);
    for argument in command.get_args() {
        label.push(' ');
        label.push_str(&argument.to_string_lossy());
    }
    truncate(&label, COMMAND_LABEL_LIMIT)
}

fn drain<R: Read + Send + 'static>(reader: Option<R>) -> JoinHandle<Vec<u8>> {
    thread::spawn(move || {
        let mut buffer = Vec::new();
        if let Some(mut reader) = reader {
            let _ = reader.read_to_end(&mut buffer);
        }
        buffer
    })
}

fn finish(handle: JoinHandle<Vec<u8>>, deadline: Instant, label: &str) -> Result<Vec<u8>, String> {
    while !handle.is_finished() {
        if Instant::now() >= deadline {
            return Err(format!(
                "{label} did not close its output pipes within the bound"
            ));
        }
        thread::sleep(GIT_POLL_INTERVAL);
    }
    Ok(handle.join().unwrap_or_default())
}
