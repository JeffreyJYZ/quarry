#!/usr/bin/env bun
/**
 * Which DAP `evaluate` shapes a locally stopped Rust program answers, and what the fallbacks say.
 *
 * Every variant is recorded as `OK <value>` or `FAIL <reason>`, so a shape that silently returns
 * nothing is visible as an empty `OK`. The work lives in `dap-eval-probe/`; this file is the entry
 * point and nothing else.
 *
 * Usage: bun run scripts/dap-eval-probe.ts
 */

import { runProbe } from "./dap-eval-probe/probe";

runProbe().catch((e) => {
	console.error(`dap-eval-probe: ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
