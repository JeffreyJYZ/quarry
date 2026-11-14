/**
 * The updater pair: a signed archive beside a public key, both newer than what they install.
 *
 * An installed app updates only from that pair, so a missing, unsigned or stale one means the
 * release cannot be installed at all — which is a failure, not a warning.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { BundlePaths } from "./paths";

/** Whether the build must produce updater artefacts, and whether a public key is baked in. */
export function readUpdaterConfig(root: string): { artifacts: boolean; pubkey: string | null } {
	const raw = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8")) as {
		bundle?: { createUpdaterArtifacts?: boolean | string };
		plugins?: { updater?: { pubkey?: string } };
	};
	return {
		artifacts: raw.bundle?.createUpdaterArtifacts === true,
		pubkey: raw.plugins?.updater?.pubkey ?? null,
	};
}

/** Tauri's `.sig` is base64 of a minisign blob; an empty or truncated file fails here. */
export function signatureOk(path: string): boolean {
	if (!existsSync(path)) return false;
	const text = readFileSync(path, "utf8").trim();
	if (text === "") return false;
	return Buffer.from(text, "base64").toString("utf8").includes("untrusted comment");
}

export interface UpdaterReport {
	detail: string;
	reasons: string[];
}

export function updaterReport(
	paths: BundlePaths,
	distMtime: Date | null,
	appBinaryMtime: Date | null,
): UpdaterReport {
	const config = readUpdaterConfig(paths.root);
	const reasons: string[] = [];
	let detail = "not configured";
	if (!config.artifacts) return { detail, reasons };

	const tarMtime = existsSync(paths.updaterTar) ? statSync(paths.updaterTar).mtime : null;
	const sigOk = signatureOk(paths.updaterSig);
	if (tarMtime === null) {
		reasons.push(
			`MISSING updater archive: ${paths.updaterTar} — ${paths.rebuildHint} with TAURI_SIGNING_PRIVATE_KEY set`,
		);
	}
	if (!sigOk) {
		reasons.push(`MISSING or unreadable updater signature: ${paths.updaterSig}`);
	}
	if (distMtime !== null && tarMtime !== null && distMtime.getTime() > tarMtime.getTime()) {
		reasons.push(`STALE: dist is newer than the updater archive — ${paths.rebuildHint}`);
	}
	if (
		appBinaryMtime !== null &&
		tarMtime !== null &&
		appBinaryMtime.getTime() > tarMtime.getTime()
	) {
		reasons.push(
			`STALE: the bundled app is newer than the updater archive — ${paths.rebuildHint}`,
		);
	}
	if (config.pubkey === null || config.pubkey.trim() === "") {
		reasons.push("MISSING plugins.updater.pubkey in src-tauri/tauri.conf.json");
	}
	const size =
		tarMtime === null
			? "absent"
			: `${(statSync(paths.updaterTar).size / 1024 / 1024).toFixed(2)} MiB`;
	detail = `${size} sig=${sigOk ? "present" : "absent"}`;
	return { detail, reasons };
}
