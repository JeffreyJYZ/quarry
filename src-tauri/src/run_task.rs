//! Run a program without the debugger, streaming its output.
//!
//! One child per run id, spawned directly and never through a shell, with stdout and stderr pumped
//! line by line into `run://output` events and exactly one `run://exited` once the child is reaped.
//! A run id is `run-<n>` from a monotonic counter, so a stale event can never address a newer process.
//!
//! Waiting rule: `Child::kill` needs `&mut Child`, so a waiter blocked inside `wait()` would make the
//! child unkillable from `stop_program`. The waiter therefore polls `try_wait` at a short interval
//! and reaps the child itself; `stop_program` kills and reaps too, and the waiter still reports the
//! exit, so a stopped run emits the same single event with a `null` code.
//!
//! Nothing here panics: a failed thread spawn is a command error, a failed emit is ignored, and a
//! poisoned mutex is recovered rather than unwrapped.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashMap;
use std::io::{self, BufRead, BufReader, ErrorKind, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

/// Event names the frontend listens for.
const OUTPUT_EVENT: &str = "run://output";
const EXITED_EVENT: &str = "run://exited";

/// The two stream names the output payload carries.
const STDOUT: &str = "stdout";
const STDERR: &str = "stderr";

/// One event carries at most this many bytes of a line; the rest arrives as further events.
const MAX_LINE_BYTES: usize = 8 * 1024;

/// How often the waiter asks the child for its status; a kill needs the lock, so it stays short.
const WAIT_INTERVAL: Duration = Duration::from_millis(20);

/// Live children by run id. The map is shared with the waiter threads, which drop their own entry.
type Runs = HashMap<String, Arc<Mutex<Option<Child>>>>;

/// Managed state: one live child per run id, and the counter that names the next run.
#[derive(Default)]
pub struct RunState {
    runs: Arc<Mutex<Runs>>,
    /// Only ever incremented, so an id is never reused while a stale thread is still draining.
    counter: AtomicU64,
}

/// One environment variable passed to a run; overrides the inherited value for that name.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvVar {
    pub name: String,
    pub value: String,
}

/// `program` and `cwd` must be absolute; `args` are passed verbatim.
#[tauri::command]
pub async fn run_program(
    app: AppHandle,
    state: State<'_, RunState>,
    program: String,
    args: Vec<String>,
    cwd: String,
    env: Option<Vec<EnvVar>>,
) -> Result<String, String> {
    let (program, cwd) = validate(&program, &cwd)?;
    let program_text = display(&program);
    let cwd_text = display(&cwd);

    let env_vars = validate_env(env)?;

    let mut command = Command::new(&program);
    command
        .args(&args)
        .current_dir(&cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for var in &env_vars {
        command.env(&var.name, &var.value);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("cannot run {program_text} in {cwd_text}: {error}"))?;

    let (Some(stdout), Some(stderr)) = (child.stdout.take(), child.stderr.take()) else {
        let _ = child.kill();
        let _ = child.wait();
        return Err(format!(
            "cannot capture the output of {program_text}: its pipes were not created"
        ));
    };

    let run_id = next_id(&state.counter);
    let entry: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(Some(child)));
    lock(&state.runs).insert(run_id.clone(), Arc::clone(&entry));

    let streams = [
        spawn_reader(&app, &run_id, STDOUT, stdout),
        spawn_reader(&app, &run_id, STDERR, stderr),
    ];
    let failure = streams
        .into_iter()
        .find_map(Result::err)
        .or_else(|| spawn_waiter(&app, &run_id, entry, Arc::clone(&state.runs)).err());

    if let Some(error) = failure {
        discard(&state.runs, &run_id);
        return Err(format!(
            "cannot stream the output of {program_text}: {error}"
        ));
    }

    Ok(run_id)
}

/// Kill a running child and reap it; an unknown id is already stopped, which is not an error.
#[tauri::command]
pub async fn stop_program(state: State<'_, RunState>, run_id: String) -> Result<(), String> {
    let entry = lock(&state.runs).get(&run_id).cloned();
    let Some(entry) = entry else {
        return Ok(());
    };

    let Some(mut child) = lock(&entry).take() else {
        // The waiter already reaped it and is about to report the exit.
        return Ok(());
    };

    if let Err(error) = child.kill()
        && !matches!(error.kind(), ErrorKind::InvalidInput | ErrorKind::NotFound)
    {
        // Hand the child back so the waiter keeps watching it instead of leaking a zombie.
        lock(&entry).replace(child);
        return Err(format!("cannot stop {run_id}: {error}"));
    }

    child
        .wait()
        .map(|_status| ())
        .map_err(|error| format!("cannot reap {run_id}: {error}"))
}

impl Drop for RunState {
    /// Last resort at app shutdown: no child outlives the window.
    fn drop(&mut self) {
        for entry in lock(&self.runs).values() {
            let Some(mut child) = lock(entry).take() else {
                continue;
            };
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Absolute `program` that is a file and absolute `cwd` that is a directory; errors name the path.
fn validate(program: &str, cwd: &str) -> Result<(PathBuf, PathBuf), String> {
    let program_path = Path::new(program);
    if !program_path.is_absolute() {
        return Err(format!(
            "cannot run {program:?}: the program path must be absolute"
        ));
    }
    if !program_path.is_file() {
        return Err(format!(
            "cannot run {program:?}: it is not an existing file"
        ));
    }

    let cwd_path = Path::new(cwd);
    if !cwd_path.is_absolute() {
        return Err(format!(
            "cannot run a program in {cwd:?}: the working directory must be absolute"
        ));
    }
    if !cwd_path.is_dir() {
        return Err(format!(
            "cannot run a program in {cwd:?}: it is not an existing directory"
        ));
    }

    Ok((program_path.to_path_buf(), cwd_path.to_path_buf()))
}

/// Validate and normalize the optional environment list.
///
/// `None` and an empty list both mean "inherit the parent environment", so they normalize to an empty
/// list. Each name must be a valid POSIX-ish identifier; the first bad name rejects the whole call.
pub fn validate_env(env: Option<Vec<EnvVar>>) -> Result<Vec<EnvVar>, String> {
    let Some(vars) = env else {
        return Ok(Vec::new());
    };
    if vars.is_empty() {
        return Ok(Vec::new());
    }
    for var in &vars {
        if !valid_env_name(&var.name) {
            return Err(format!("invalid environment variable name: {}", var.name));
        }
    }
    Ok(vars)
}

pub fn valid_env_name(name: &str) -> bool {
    if name.is_empty() {
        return false;
    }
    let mut chars = name.chars();
    let first = chars.next().unwrap();
    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// Wire-stable id for the nth run.
fn run_id(number: u64) -> String {
    format!("run-{number}")
}

fn next_id(counter: &AtomicU64) -> String {
    run_id(counter.fetch_add(1, Ordering::SeqCst).saturating_add(1))
}

fn output_payload(run_id: &str, stream: &str, line: String) -> Value {
    json!({ "runId": run_id, "stream": stream, "line": line })
}

/// A `None` code is a kill by signal, which JSON carries as `null`.
fn exited_payload(run_id: &str, code: Option<i32>) -> Value {
    json!({ "runId": run_id, "code": code })
}

/// One thread per stream, detached: it ends at EOF, so a shutdown never waits on it.
fn spawn_reader<R: Read + Send + 'static>(
    app: &AppHandle,
    run_id: &str,
    stream: &'static str,
    reader: R,
) -> io::Result<()> {
    let app = app.clone();
    let run_id = run_id.to_string();
    thread::Builder::new()
        .name(format!("{run_id}-{stream}"))
        .spawn(move || pump(reader, &app, &run_id, stream))
        .map(drop)
}

/// Emit one event per complete line of one stream, until the pipe closes.
fn pump<R: Read>(reader: R, app: &AppHandle, run_id: &str, stream: &'static str) {
    let mut reader = BufReader::new(reader);
    let mut buffer = Vec::new();

    loop {
        buffer.clear();
        match reader.read_until(b'\n', &mut buffer) {
            Ok(0) => break,
            Ok(_) => {
                strip_terminator(&mut buffer);
                for line in split_line(&buffer) {
                    let payload = output_payload(run_id, stream, line);
                    let _ = app.emit(OUTPUT_EVENT, payload);
                }
            }
            Err(error) if error.kind() == ErrorKind::Interrupted => {}
            Err(_) => break,
        }
    }
}

/// Drop the line ending so a CRLF stream does not surface a stray carriage return.
fn strip_terminator(line: &mut Vec<u8>) {
    if line.last() == Some(&b'\n') {
        line.pop();
    }
    if line.last() == Some(&b'\r') {
        line.pop();
    }
}

/// Split one physical line into [`MAX_LINE_BYTES`] chunks and decode each one lossily.
///
/// A chunk boundary can fall inside a UTF-8 sequence, which is why each chunk is decoded with
/// `from_utf8_lossy`: a replacement character is better than losing the rest of the line. A blank
/// line is one empty chunk, so the panel keeps the program's spacing.
fn split_line(line: &[u8]) -> Vec<String> {
    let mut chunks: Vec<String> = line
        .chunks(MAX_LINE_BYTES)
        .map(|chunk| String::from_utf8_lossy(chunk).into_owned())
        .collect();
    if chunks.is_empty() {
        chunks.push(String::new());
    }
    chunks
}

/// Detached thread that reports the exit and forgets the run.
fn spawn_waiter(
    app: &AppHandle,
    run_id: &str,
    entry: Arc<Mutex<Option<Child>>>,
    runs: Arc<Mutex<Runs>>,
) -> io::Result<()> {
    let app = app.clone();
    let id = run_id.to_string();
    thread::Builder::new()
        .name(format!("{run_id}-waiter"))
        .spawn(move || {
            let code = wait_for_exit(&entry);
            let payload = exited_payload(&id, code);
            let _ = app.emit(EXITED_EVENT, payload);
            lock(&runs).remove(&id);
        })
        .map(drop)
}

/// Block the caller's thread until the child is gone, then give its exit code.
fn wait_for_exit(entry: &Mutex<Option<Child>>) -> Option<i32> {
    loop {
        match reap(entry) {
            Reap::Exited(code) => return code,
            Reap::Gone => return None,
            Reap::Running => thread::sleep(WAIT_INTERVAL),
        }
    }
}

/// Outcome of one non-blocking look at the child.
enum Reap {
    /// The child exited and was reaped here.
    Exited(Option<i32>),
    /// `stop_program` or the shutdown path took the child; the exit code is unknowable.
    Gone,
    /// Still running.
    Running,
}

fn reap(entry: &Mutex<Option<Child>>) -> Reap {
    let mut guard = lock(entry);
    let Some(child) = guard.as_mut() else {
        return Reap::Gone;
    };
    match child.try_wait() {
        Ok(Some(status)) => {
            // Drop the handle, so no later path can signal a pid the system may have recycled.
            *guard = None;
            Reap::Exited(status.code())
        }
        Ok(None) => Reap::Running,
        Err(_) => {
            *guard = None;
            Reap::Gone
        }
    }
}

/// Roll back a run whose threads could not start: kill, reap, forget.
fn discard(runs: &Mutex<Runs>, run_id: &str) {
    let Some(entry) = lock(runs).remove(run_id) else {
        return;
    };
    if let Some(mut child) = lock(&entry).take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// A poisoned mutex still holds a usable value, and no path here panics while holding one.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|error| error.into_inner())
}

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_ids_count_from_one_and_never_repeat() {
        assert_eq!(run_id(1), "run-1");
        assert_eq!(run_id(41), "run-41");

        let counter = AtomicU64::new(0);
        assert_eq!(next_id(&counter), "run-1");
        assert_eq!(next_id(&counter), "run-2");
        assert_eq!(next_id(&counter), "run-3");
        assert_eq!(counter.load(Ordering::SeqCst), 3);
    }

    #[test]
    fn a_line_of_exactly_the_limit_stays_whole() {
        let exact = vec![b'a'; MAX_LINE_BYTES];

        let chunks = split_line(&exact);

        assert_eq!(
            chunks.len(),
            1,
            "exactly {MAX_LINE_BYTES} bytes is one line"
        );
        assert_eq!(chunks[0].len(), MAX_LINE_BYTES);
    }

    #[test]
    fn a_line_above_the_limit_is_split_at_the_limit() {
        let over = vec![b'b'; MAX_LINE_BYTES + 3];

        let chunks = split_line(&over);

        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].len(), MAX_LINE_BYTES);
        assert_eq!(chunks[1], "bbb");

        assert_eq!(split_line(&vec![b'c'; MAX_LINE_BYTES * 2]).len(), 2);
    }

    #[test]
    fn invalid_utf8_becomes_replacement_characters() {
        let chunks = split_line(b"ok\xff end");

        assert_eq!(chunks, vec!["ok\u{fffd} end".to_string()]);
    }

    #[test]
    fn a_blank_line_is_one_empty_chunk() {
        assert_eq!(split_line(b""), vec![String::new()]);
    }

    #[test]
    fn exit_codes_map_to_a_number_or_null() {
        let exited = exited_payload("run-7", Some(3));
        assert_eq!(exited["runId"], "run-7");
        assert_eq!(exited["code"], 3);

        let killed = exited_payload("run-7", None);
        assert_eq!(killed["code"], Value::Null);
        assert!(killed["code"].as_i64().is_none());
    }

    #[test]
    fn output_payloads_name_their_stream() {
        let stdout = output_payload("run-1", STDOUT, "hello".to_string());

        assert_eq!(stdout["runId"], "run-1");
        assert_eq!(stdout["stream"], "stdout");
        assert_eq!(stdout["line"], "hello");
        assert_eq!(
            output_payload("run-1", STDERR, "oops".to_string())["stream"],
            "stderr"
        );
    }

    #[test]
    fn relative_paths_are_rejected_by_name() {
        let error = validate("target/debug/app", "/tmp").expect_err("relative program");
        assert!(
            error.contains("target/debug/app"),
            "unexpected error: {error}"
        );
        assert!(error.contains("absolute"), "error should say why: {error}");

        let error = validate("/bin/sh", "relative/dir").expect_err("relative cwd");
        assert!(error.contains("relative/dir"), "unexpected error: {error}");
    }

    #[test]
    fn a_missing_program_is_rejected_by_name() {
        let error =
            validate("/nonexistent/quarry-run-target", "/tmp").expect_err("missing program");

        assert!(
            error.contains("/nonexistent/quarry-run-target"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn env_name_validation() {
        assert!(valid_env_name("GOOD_NAME"));
        assert!(!valid_env_name(""));
        assert!(!valid_env_name("bad-name"));
        assert!(!valid_env_name("1BAD"));
    }

    #[test]
    fn env_none_empty_populated() {
        assert!(validate_env(None).unwrap().is_empty());
        assert!(validate_env(Some(vec![])).unwrap().is_empty());
        let v = validate_env(Some(vec![EnvVar {
            name: "X".into(),
            value: "y".into(),
        }]))
        .unwrap();
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].name, "X");
    }
}
