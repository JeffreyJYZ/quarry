#!/usr/bin/env bun
/**
 * Checks a built bundle before it is published: versions agree, the app is universal and signed,
 * it launches and exits, the bundle is not stale, and the updater pair is complete.
 *
 * The checks live in `verify-bundle/`; this file is the entry point and nothing else.
 */

import { join } from "node:path";
import { DEFAULT_TARGET } from "./bundle-info";
import { runCheck } from "./verify-bundle/check";
import { arg, bundlePaths } from "./verify-bundle/paths";

const ROOT = join(import.meta.dir, "..");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
	console.log(
		[
			"verify-bundle [--target <triple>]",
			"",
			"Checks the built .app, its universal architectures, signature, launch, freshness and",
			"updater artefacts. A release is universal, so that is the default target.",
			"",
			`  --target   bundle target directory (default: ${DEFAULT_TARGET})`,
		].join("\n"),
	);
	process.exit(0);
}

runCheck(bundlePaths(ROOT, arg("--target") ?? DEFAULT_TARGET))
	.then((code) => process.exit(code))
	.catch((err) => {
		console.error(err instanceof Error ? err.message : String(err));
		process.exit(1);
	});
