use super::*;

#[test]
fn parses_fixture_with_duplicates_blank_and_spaces() {
    let input = "  1 /sbin/launchd\n\
		2 /System/Library/Frameworks/.../kernel_task\n\
		\n\
		42 /Applications/My App/bin/tool\n\
		42 /Applications/My App/bin/tool\n\
		99 ps\n\
		0 /kernel\n";
    let parsed = parse_process_list(input);
    let names: Vec<&str> = parsed.iter().map(|p| p.name.as_str()).collect();
    assert!(names.contains(&"launchd"));
    assert!(names.contains(&"tool"));
    // duplicate pid dropped
    assert_eq!(parsed.iter().filter(|p| p.pid == 42).count(), 1);
    // blank line ignored, pid 0 dropped, ps dropped
    assert!(!parsed.iter().any(|p| p.pid == 0));
    assert!(!parsed.iter().any(|p| p.name == "ps"));
    // command with spaces keeps full command path then basename
    let tool = parsed.iter().find(|p| p.pid == 42).unwrap();
    assert_eq!(tool.name, "tool");
}

#[test]
fn sorts_case_insensitively() {
    let input = "10 /z/Zed\n5 /a/alpha\n7 /m/Mid\n";
    let parsed = parse_process_list(input);
    let names: Vec<&str> = parsed.iter().map(|p| p.name.as_str()).collect();
    assert_eq!(names, vec!["alpha", "Mid", "Zed"]);
}

#[test]
fn caps_at_500() {
    let mut input = String::new();
    for i in 1..=600u32 {
        input.push_str(&format!("{i} /bin/tool{i}\n"));
    }
    let parsed = parse_process_list(&input);
    assert_eq!(parsed.len(), 500);
}

/// A stand-in for `ps`: an executable that ignores the arguments and prints `body`.
#[cfg(unix)]
fn stand_in(tag: &str, body: &str) -> std::path::PathBuf {
    use std::os::unix::fs::PermissionsExt;

    let path = std::env::temp_dir().join(format!("quarry-ps-{tag}-{}.sh", std::process::id()));
    std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).expect("the stand-in is written");
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))
        .expect("the stand-in is executable");
    path
}

#[cfg(unix)]
#[test]
fn a_ps_that_never_exits_hits_the_bound_instead_of_hanging() {
    let ps = stand_in("hang", "sleep 30");
    let started = std::time::Instant::now();
    let error = scan(&ps, Duration::from_millis(200)).expect_err("sleep 30 cannot finish");
    let _ = std::fs::remove_file(&ps);

    assert!(error.contains("did not finish within"), "{error}");
    assert!(
        started.elapsed() < Duration::from_secs(5),
        "the call returned instead of hanging: {:?}",
        started.elapsed()
    );
}

#[cfg(unix)]
#[test]
fn scan_parses_the_output_of_the_program_it_runs() {
    let ps = stand_in("ok", "printf '10 /bin/foo\\n20 /bin/bar\\n'");
    let parsed = scan(&ps, Duration::from_secs(5)).expect("the stand-in exits");
    let _ = std::fs::remove_file(&ps);

    let names: Vec<&str> = parsed.iter().map(|p| p.name.as_str()).collect();
    assert_eq!(names, vec!["bar", "foo"]);
}
