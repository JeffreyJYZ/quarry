# Stop/build flake: the group survives when it is signalled mid-fork

## Verdict

Cause (2): a real window in the product, not a test asserting too early.

`terminate` signals the group once, at `TERM`, then again at `KILL`, and each call is bounded by
`drained(child, grace)` — and `drained` asks about the **direct child only** (`Child::try_wait`).
A build that is forking at the moment the signal is delivered (`cargo` starting `rustc`, `cmake`
starting `cc`) can create a member that inherits the process group _after_ that signal was
delivered. That member never receives the group signal, and the polite path returns as soon as the
leader is reaped, so nothing escalates and the escaped compiler keeps running.

So the test was right and the product leaked a compiler; widening the sleep would have hidden it.

## Reproduced on purpose

Probe: a shell whose `TERM` handler forks a child and exits —

```sh
trap 'sleep 30 & exit 0' TERM; echo ready; while :; do :; done
```

The marker is read before `stop` is called, so the trap is provably installed and the fork is
provably after the signal. Before the fix:

```
FAILED build_task::tests_build::build_state_tests::stop_build_reaches_a_child_forked_after_the_group_was_signalled
a member forked after the signal survived the stop: 12477 S    sleep 30
```

That test is now a permanent case (`stop_build_reaches_a_child_forked_after_the_group_was_signalled`),
so this stays proven green rather than depending on a busy machine.

Load-driven evidence, same seed: 400 rounds of the flaky test's own script at its own 3 s bound,
under a 12-spinner CPU load, gave 3 survivors, all `S    sleep 30` with PPID 1, and each was
cleared by one more group kill — the fork window, not a slow reap. `stop_build` itself showed
0/700 failures in that probe, which is exactly why it only reddens at random.

## Fix

`src-tauri/src/build_task/stop_group.rs`: `stop_group(child)` calls `stop_tree(child)` and then
sweeps. `sweep_group` asks `kill -0 -- -<pid>` whether the group still has any member, and when it
does, kills the group again and looks once more, bounded by `KILL_GRACE` and stepping on
`WAIT_INTERVAL`. The loop ends on a condition, never on a sleep, and once every member is dead
there is nothing left to fork. Every build-path caller (`BuildState::stop`, `begin`'s refusal,
`shutdown_all`, `run_child`'s three cleanup paths) now uses `stop_group`; `run_task` and
`teardown.rs` are untouched.

## Evidence after the fix

- 25 consecutive `cargo test --lib tests_build::` runs under 12 CPU spinners: 0 failures.
- 20 more, separately: 0 failures.
- 21 consecutive runs of `build_state_tests` alone under load: 0 failures.
- `cargo nextest run` with 12 spinners beside it: 794 passed, 1 skipped.
- Plain `cargo test`: green; `cargo clippy --all-targets -- -D warnings`: clean;
  `bun run scripts/check-file-size.ts`: 0 oversized.
