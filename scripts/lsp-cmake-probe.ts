#!/usr/bin/env bun
/**
 * clangd hand-off probe for a CMake C/C++ project.
 *
 * Builds a real CMake project in a temp directory — a local header under `include/` and an `extern`
 * declaration the header promises — and measures the two halves separately:
 *
 *   before  clangd started in the project root with no arguments, which is what an analyser that
 *           cannot find the database does: the build tree here is CLion's `cmake-build-debug/`,
 *           a directory clangd does not search (it does search `build/`), so the header is
 *           unresolved and the extern symbol unknown;
 *   after   clangd started with the directory of the compile database and the compiler to query,
 *           which is what `lsp/handoff` hands it: no error diagnostics, and the extern declaration
 *           hovers as the type the header gives it.
 *
 * The flag names are read back from the Rust source, so the probe cannot drift from the hand-off it
 * tests. `cmake --build` runs first: code the build rejects is not the case being proven.
 *
 * The work lives in `lsp-cmake-probe/`; this file is the entry point and nothing else.
 *
 * Usage: bun run scripts/lsp-cmake-probe.ts
 */

import { join } from "node:path";
import { runProbe } from "./lsp-cmake-probe/probe";

runProbe(join(import.meta.dir, ".."))
	.then(({ lines, failures }) => {
		console.log(lines.join("\n"));
		if (failures.length > 0) process.exit(1);
	})
	.catch((error) => {
		console.error(`lsp-cmake-probe: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	});
