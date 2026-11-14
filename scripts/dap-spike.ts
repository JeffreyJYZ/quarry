#!/usr/bin/env bun
/**
 * DAP spike for quarry (docs/plans/001-clion-parity.md §6).
 *
 * Generates a throwaway cargo project in a temp dir, builds it, then speaks
 * raw DAP to lldb-dap over Content-Length framed JSON on stdio and measures:
 * readMemory, disassemble, data breakpoints, and whether Rust Vec/String
 * pretty-print. Exits non-zero when a required step fails.
 *
 * The steps live in `dap-spike/`; this file is the entry point and nothing else.
 *
 * Usage: bun run scripts/dap-spike.ts [--project <dir>] [--json]
 */

import { main } from "./dap-spike/main";

main().catch((error) => {
	console.error(`dap-spike: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
