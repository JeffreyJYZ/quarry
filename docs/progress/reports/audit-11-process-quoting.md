# Audit 11 — Process quoting and argument passing

Rust+C++ IDE at /Users/jyz/dev/monorepos/quarry. Focus: how arguments reach child processes in `src-tauri/src`, plus the single TS shell site and the PTY.

## Ranked findings

### P1 — `build` field in `.quarry/launch.json` is an arbitrary shell line

- `src/lib/debug/buildCommand.ts:22-30` declares the preset `build` field to be a "shell line" that "goes through the user's login shell". It runs `runProgram(shell, ["/bin/zsh" or "cmd.exe"], …, root)` with `["-lc", command]`.
- Any write access to a project's `.quarry/launch.json` (shared checkout, planted repo) makes a commit of a `build` value run as the user on next "build". No validation, no confirmation. Documented intent, but worth a prominent trust note.
- Concrete fix: show the command and require explicit confirmation before running an untrusted `build` line, or restrict `build` to program+args.

### P1 — `cargo_program()` honours `$CARGO` env with no validation

- `src-tauri/src/test_task/capture.rs:248-253` (`cargo_program`) and `src-tauri/src/build_task/default_cargo.rs` (`DEFAULT_CARGO`)
- `$CARGO` is passed straight to `Command::new`/resolution; a Dock-launched app with a poisoned env (unlikely but possible via project env) changes the binary. PATH-only validation.
- Fix: canonicalise and require the resolved path to be a file named cargo, otherwise fall back to resolved `cargo`.

### P2 — env values with `=`/newlines

- `run_task/output_event.rs:run_program` calls `command.env(&var.name, &var.value)` with validated name only. Value unchecked.
- Rust's `Command::env` passes the value unchanged, so a newline in `value` becomes part of env (OS allows it on posix, but shell reads may misparse); an `=` does not split because it's the second arg. Low practical impact. No injection via argv. No fix needed beyond docs; optional validation rejecting `\n`.

### P2 — Run config program/args/cwd: safely array-passed

- `run_config/launch_dir.rs:resolve` returns `args: preset.args.clone()` (Vec<String>).
- `run_task/output_event.rs:run_program` validates `program`/`cwd` as absolute existing file/dir, then `Command::new(&program).args(&args)`. No shell, quoted safe.
- A path with space/quote/`$(...)` in `program` fails validation if nonexistent; in `args` it is passed verbatim to exec. Safe.

### P2 — DAP init_commands / args are data to lldb-dap, not shell

- `dap/handshake_launch.rs` sends `args` and `initCommands` as JSON arrays/strings into the DAP `launch` request. lldb-dap parses them itself. The app never shells the command. Safe.

### P2 — PTY shell

- `pty/mod.rs:pty_open` picks `SHELL` (default `/bin/zsh`), spawns it as the PTY child with `CommandBuilder::new(&shell)` and `cwd`. No app-composed command string is passed; only env (`TERM`, `COLORTERM`, `LANG`/`LC_ALL` when unset).
- `pty_write` forwards raw keystrokes; anything pasted is interpreted by the shell only at the terminal layer (expected for a terminal).
- A `cwd` with spaces works because portable_pty sets cwd at spawn, not via shell.
- Risk: the login shell evaluates nothing app-composed, so no command injection from app side; user typing is expected.

### Checked, no issue (no shell involved, argv as separate args)

- Git all commands: `commit_argv`, `checkout_argv`, `run_mutation` use `.args` with validated paths; mutation uses `--` separator. Branch names charset-validated. Safe.
- clang/plain build: `Command::new(&resolved.path).args(&argv[1..])`. Safe.
- CMake configure/build: `run_cmake` uses `.args(&argv[1..])`. Safe.
- Cargo build/test: `.arg("build")` etc and `.args(args)`. Safe.
- LSP: `Command::new(&binary).args(&overrides.args)`. Safe; args already split by caller.
- Format: `Command::new(&binary).args(argv(...))`; `clang_style` content is an `-style=...` single argument, not shell-parsed. Safe, though long.
- Resolve tool search: walks PATH, no shell; `xcrun --find name` is argv. Safe.
- Process discovery: `ps -axo pid=,comm=` via args. Safe.
- DAP adapter: `Command::new(&adapter)` plus piped stdio; no argv from user beyond env PATH. Safe.

## Conclusion

No shell-injection bugs found in Rust process spawning. The two deliberate shell sites are the TS `build` command (documented, user-authored) and the PTY (expected terminal). The remaining Recommendation is documenting the `build` trust boundary and validating `$CARGO`.
