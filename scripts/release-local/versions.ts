/**
 * The version every file must agree on before anything is built.
 *
 * A half-bumped tree is refused here rather than published: the update manifest names a version, and
 * four files claiming different ones is how an app reinstalls itself forever.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lockVersion, versionDrift } from "../release-manifest";
import { fail, ROOT } from "./process";

export interface Versions {
	package: string;
	tauri: string;
	cargo: string;
	site: string;
	lock: string;
}

/** Every file `bump-version.ts` writes, so a half-bumped tree is refused before a build. */
export function readVersions(): Versions {
	const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
	const tauri = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf8")) as {
		version: string;
	};
	const site = JSON.parse(readFileSync(join(ROOT, "website", "package.json"), "utf8")) as {
		version: string;
	};
	const cargoRaw = readFileSync(join(ROOT, "src-tauri", "Cargo.toml"), "utf8");
	const cargo = /^version\s*=\s*"([^"]+)"/m.exec(cargoRaw)?.[1] ?? "";
	const lock = lockVersion(readFileSync(join(ROOT, "src-tauri", "Cargo.lock"), "utf8"));
	return { package: pkg.version, tauri: tauri.version, cargo, site: site.version, lock };
}

export function readVersion(): string {
	const versions = readVersions();
	const drift = versionDrift(versions);
	if (drift !== null) fail(drift);
	return versions.package;
}

/** `quarry-alpha12` for `X.Y.Z-alpha.12`, `vX.Y.Z` for a stable version. */
export function expectedTag(version: string): string {
	const alpha = /^(\d+\.\d+\.\d+)-alpha\.(\d+)$/.exec(version);
	if (alpha !== null) return `quarry-alpha${alpha[2]}`;
	return `v${version}`;
}
