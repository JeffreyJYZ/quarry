//! The writer: it appends, it flushes immediately, and it rotates once to a single `.1`.

use std::fs;
use std::path::PathBuf;

use super::sink::Sink;

/// A private directory per test; the name carries the pid so two runs cannot share one.
fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("quarry-log-{}-{}", name, std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("create scratch directory");
    dir
}

#[test]
fn the_parent_directory_is_created_and_lines_append() {
    let dir = scratch("append");
    let path = dir.join("nested").join("quarry.log");
    let sink = Sink::new(path.clone());

    sink.write_line("first").expect("write first");
    sink.write_line("second").expect("write second");

    let text = fs::read_to_string(&path).expect("read log");
    assert_eq!(text, "first\nsecond\n");
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn every_line_is_flushed_without_dropping_the_sink() {
    let dir = scratch("flush");
    let path = dir.join("quarry.log");
    let sink = Sink::new(path.clone());

    sink.write_line("kept after a crash").expect("write line");

    // Read while the sink is still alive: a buffered writer would show nothing yet.
    let text = fs::read_to_string(&path).expect("read before drop");
    assert_eq!(text, "kept after a crash\n");
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn the_file_rotates_once_to_a_single_backup() {
    let dir = scratch("rotate");
    let path = dir.join("quarry.log");
    let backup = dir.join("quarry.log.1");
    let sink = Sink::with_limit(path.clone(), 40);

    sink.write_line("aaaaaaaaaa").expect("write 1");
    sink.write_line("bbbbbbbbbb").expect("write 2");
    sink.write_line("cccccccccc").expect("write 3");
    sink.write_line("dddddddddd").expect("write 4");

    assert!(
        backup.exists(),
        "a backup is written once the file passes the limit"
    );
    let current = fs::read_to_string(&path).expect("read current");
    let previous = fs::read_to_string(&backup).expect("read backup");
    assert!(current.len() <= 40, "the new file starts over: {current:?}");
    assert!(
        previous.contains("aaaaaaaaaa"),
        "the backup holds the earlier lines"
    );
    assert!(
        !previous.contains("dddddddddd"),
        "the backup predates the newest line"
    );

    // A second rotation replaces the backup rather than growing a second one.
    for _ in 0..6 {
        sink.write_line("eeeeeeeeee").expect("write more");
    }
    let entries = fs::read_dir(&dir).expect("list directory").count();
    assert_eq!(entries, 2, "one live file and one backup, never a chain");
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn an_existing_large_file_rotates_on_the_first_write() {
    let dir = scratch("existing");
    let path = dir.join("quarry.log");
    fs::write(&path, "x".repeat(80)).expect("seed a large file");
    let sink = Sink::with_limit(path.clone(), 40);

    sink.write_line("new line").expect("write after restart");

    assert!(
        dir.join("quarry.log.1").exists(),
        "the previous run's file is rotated aside"
    );
    assert_eq!(
        fs::read_to_string(&path).expect("read current"),
        "new line\n"
    );
    let _ = fs::remove_dir_all(&dir);
}
