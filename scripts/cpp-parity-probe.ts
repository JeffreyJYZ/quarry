#!/usr/bin/env bun
/**
 * C/C++ parity probe: what "matches CLion's compiler system" means here, measured against the
 * product rather than against a copy of its decisions.
 *
 * Each fixture is a project a CLion user actually has — presets with their own binary dir, a
 * toolchain file, a library plus an app that includes it by a build-system-only path, a project
 * configured into `cmake-build-debug/`, a generator that writes no compiler database, standard
 * headers through the compiler CMake chose, and a plain C++ project with no build system at all,
 * which quarry compiles itself. For each one the probe asks the product what it would
 * do, then does exactly that, and reports the consumers separately:
 *
 *   build     the argv `src-tauri/examples/quarry-plan.rs` reports, spawned in the working directory
 *             it reports. That binary prints the answer of `cmake_plan` — the same function
 *             `run_cmake_build` calls — so presets, the detected build root and the toolchain file
 *             are the product's decisions, not this script's.
 *   analysis  clangd spawned in the project root with the arguments the hand-off composes
 *             (`server_args`: `--compile-commands-dir`, `--query-driver`, plus the user's own), and
 *             asked for hover at a position that needs the build system's flags. The hover must
 *             contain the expectation the fixture's own build guarantees; when that build records a
 *             database, the same clangd given only `--compile-commands-dir` it produced is run as a
 *             cross-check of the expectation, so a wrong expectation fails the probe, not the row.
 *   targets   the rows `list_run_targets` offers and the program `resolve_run_target` names for the
 *             first of them, which is what Run would launch.
 *   tree      whether opening the project left a second build tree behind. The plan names the tree
 *             analysis reads, so a `build/` created only to have a database for clangd is a failure
 *             even when the hover happens to pass through it.
 *
 * It prints PASS/FAIL per capability, a capability × consumer table, then one finding per failure
 * with the command that produced it. Exit 1 when a capability fails, 2 when a fixture or the seam
 * is broken (a probe defect, not a product finding).
 *
 * The fixtures are left in place on purpose: every finding quotes `cd <fixture> && …` against the
 * printed root, so a reader can rerun it by hand.
 *
 * The last rows are a second toolchain: the same measurements against a project configured with
 * Homebrew GCC, whose standard headers clangd can only find because the hand-off's
 * `--query-driver` names that compiler — once bare, once behind a launcher that `exec`s it. They
 * are skipped by name on a machine that has no GCC.
 *
 * Usage: bun scripts/cpp-parity-probe.ts
 */

import { main } from "./cpp-parity/main";

main().catch((error) => {
	// The message alone cannot diagnose a harness defect: `fixture is not defined` named no line, and
	// that cost a Windows CI run. The stack goes out whenever the runtime has one.
	const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`cpp-parity-probe: ${detail}`);
	process.exit(2);
});
