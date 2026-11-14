/**
 * The three version files a build must agree on, read without trusting any of them.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export function readPackageVersion(root: string): string {
	const raw = readFileSync(join(root, "package.json"), "utf8");
	return (JSON.parse(raw) as { version: string }).version;
}

export function readCargoVersion(root: string): string {
	const raw = readFileSync(join(root, "src-tauri", "Cargo.toml"), "utf8");
	const m = /^version\s*=\s*"([^"]+)"/m.exec(raw);
	if (!m) throw new Error("cargo version not found");
	return m[1];
}

export function readTauriVersion(root: string): string {
	const raw = readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8");
	return (JSON.parse(raw) as { version: string }).version;
}
