/**
 * Which DAP `evaluate` shapes actually work on this machine, for C and for Rust.
 *
 * Two readings of this used to fight each other: `docs/spikes/dap.md` recorded that `evaluate`
 * fails for Rust (`Expression evaluation in Rust not supported`, Objective-C++ fallback), while the
 * dock ships a working Evaluate field. Both were measured, of different requests. This script
 * separates the variables in a fixed order:
 *
 * 1. No `frameId`, as the FIRST request on a freshly stopped process — so a refusal cannot be state
 *    drift left by an earlier call. Then the same session asks again WITH the frame id.
 * 2. Every `context` with the stopped frame's id, plus the omitted case.
 * 3. The same requests without a frame id, after successes, to show the shape is what matters.
 * 4. Rust syntax beyond a local: a method call and an `as` cast, which lldb's parser does not accept.
 *
 * Every attempt must answer with a value or with a message — never a silent empty success, which
 * would leave the field blank with nothing to report. The context the UI defaults to
 * (`DEFAULT_CONTEXT`) must return a value on both targets.
 *
 * The work lives in `dap-eval-contexts/`; this file is the entry point and nothing else.
 *
 * Usage: bun run scripts/dap-eval-contexts.ts
 */

import { runProbe } from "./dap-eval-contexts/report";

runProbe().catch((error) => {
	console.error(`dap-eval-contexts: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
