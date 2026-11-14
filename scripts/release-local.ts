#!/usr/bin/env bun
/**
 * Fast release: build on this Mac and publish macOS artefacts directly.
 *
 * The steps live in `release-local/`; this file is the entry point and nothing else. Run it as
 * `bun scripts/release-local.ts`.
 */

import { main } from "./release-local/main";

main()
	.then((code) => process.exit(code))
	.catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	});
