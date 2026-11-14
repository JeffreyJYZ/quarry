#!/usr/bin/env bun
/**
 * C/C++ build-path smoke test for quarry.
 *
 * Proves the C/C++ build path works at all on this machine:
 *   - `clang++` is reachable through `xcrun` (the IDE's only route to the toolchain),
 *   - a deliberate type error produces a stderr line whose shape is exactly what
 *     `src-tauri/src/build_task/` parses (`path:line:column: severity: message`),
 *   - the parser carries its clear "cmake is not on PATH" message, so a missing CMake is a notice
 *     rather than a hang.
 *
 * The checks live in `cxx-smoke/`; this file is the entry point and nothing else.
 *
 * Usage: bun run scripts/cxx-smoke.ts
 */

import { killAll } from "./cxx-smoke/process";
import { reportSmoke, runSmoke } from "./cxx-smoke/smoke";

runSmoke()
	.then((result) => {
		reportSmoke(result);
		if (result.failure) process.exit(1);
	})
	.catch((error) => {
		killAll();
		console.error(`cxx-smoke: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	});
