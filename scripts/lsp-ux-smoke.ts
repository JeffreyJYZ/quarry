#!/usr/bin/env bun
/**
 * LSP UX smoke test for quarry: hover, completion, navigation, signature help, rename, code actions,
 * call hierarchy, document highlight and inlay hints, against a real rust-analyzer.
 *
 * The probes live in `lsp-ux-smoke/`; this file is the entry point and nothing else.
 *
 * Usage: bun run scripts/lsp-ux-smoke.ts
 */

import { runSmoke } from "./lsp-ux-smoke/run";

runSmoke().catch((error) => {
	console.error(error);
	process.exit(1);
});
