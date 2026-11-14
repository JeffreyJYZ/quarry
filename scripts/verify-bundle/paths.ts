/**
 * Where a bundle check looks, derived once from the target triple.
 *
 * A release is universal, so Tauri writes under the target-specific directory; a bare
 * `target/release` is the arch-only leftover and must never be read as the release.
 */

import { join } from "node:path";
import { bundleDir, DEFAULT_TARGET, releaseDir } from "../bundle-info";

export interface BundlePaths {
	root: string;
	target: string;
	bundle: string;
	app: string;
	appBinary: string;
	plainBinary: string;
	updaterTar: string;
	updaterSig: string;
	dist: string;
	/** What to run when an artefact is missing or stale. */
	rebuildHint: string;
}

export function bundlePaths(root: string, target: string = DEFAULT_TARGET): BundlePaths {
	const bundle = bundleDir(root, target);
	const app = join(bundle, "quarry.app");
	const updaterTar = join(bundle, "quarry.app.tar.gz");
	return {
		root,
		target,
		bundle,
		app,
		appBinary: join(app, "Contents", "MacOS", "quarry"),
		plainBinary: join(releaseDir(root, target), "quarry"),
		updaterTar,
		updaterSig: `${updaterTar}.sig`,
		dist: join(root, "dist"),
		rebuildHint: `run: bun run tauri build --bundles app --target ${target}`,
	};
}

/** The value after `name` on the command line, or null when the flag is absent. */
export function arg(name: string): string | null {
	const index = process.argv.indexOf(name);
	return index === -1 ? null : (process.argv[index + 1] ?? null);
}
