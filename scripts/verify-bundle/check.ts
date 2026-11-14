/**
 * The checks, in the order a bad release would fail them: versions agree, the artefact exists and
 * is universal, it is signed and launchable, the bundle is not stale, and the updater pair is
 * complete.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { lipoProblem } from "../bundle-info";
import { dirSizeMiB, iso, mtimeOf, newestFile } from "./files";
import { probeLaunch } from "./launch";
import type { BundlePaths } from "./paths";
import { updaterReport } from "./updater";
import { readCargoVersion, readPackageVersion, readTauriVersion } from "./versions";

export async function runCheck(paths: BundlePaths): Promise<number> {
	const pkgV = readPackageVersion(paths.root);
	const cargoV = readCargoVersion(paths.root);
	const tauriV = readTauriVersion(paths.root);
	const versionMatch = pkgV === cargoV && cargoV === tauriV;

	let artefactOk = false;
	let sizeMiB = 0;
	if (existsSync(paths.app)) {
		artefactOk = true;
		sizeMiB = dirSizeMiB(paths.app);
	}

	// A release is universal: a thin arch-only bundle would install on one half of the Macs and
	// would also mean this check is reading a leftover build rather than the one being shipped.
	let universal = "not checked";
	let universalOk = false;
	if (artefactOk) {
		try {
			const info = execFileSync("lipo", ["-info", paths.appBinary], { encoding: "utf8" });
			const problem = lipoProblem(info);
			universal = problem ?? "arm64 + x86_64";
			universalOk = problem === null;
		} catch {
			universal = lipoProblem(null) ?? "lipo failed";
		}
	}

	let binaryExec = false;
	let sigStatus = "not checked";
	if (artefactOk) {
		try {
			execFileSync("test", ["-x", paths.appBinary]);
			binaryExec = true;
		} catch {
			binaryExec = false;
		}
		try {
			execFileSync("codesign", ["--verify", "--deep", "--strict", paths.app], {
				stdio: ["ignore", "pipe", "pipe"],
			});
			sigStatus = "verified";
		} catch (error: unknown) {
			const failure = error as { stdout?: string; stderr?: string; message?: string };
			const msg = `${failure.stdout ?? ""} ${failure.stderr ?? ""}`.trim();
			if (/not signed|adhoc|no resources but signature/i.test(msg))
				sigStatus = "not signed (ad-hoc local build)";
			else sigStatus = `FAILED: ${msg || failure.message || "codesign failed"}`;
		}
	}

	const launch = await probeLaunch(paths.appBinary, artefactOk && binaryExec);

	// Freshness: only `tauri build` copies the current `dist/` into the `.app`. A plain
	// `bun run build` plus `cargo build --release` refreshes `dist/` and the loose binary
	// while the bundle keeps its old binary, so a launch silently runs stale UI.
	const distNewest = newestFile(paths.dist);
	const distMtime = distNewest?.mtime ?? null;
	const appBinaryMtime = mtimeOf(paths.appBinary);
	const plainBinaryMtime = mtimeOf(paths.plainBinary);
	const staleReasons: string[] = [];
	if (distMtime !== null && appBinaryMtime !== null) {
		if (distMtime.getTime() > appBinaryMtime.getTime())
			staleReasons.push(`STALE: dist is newer than the bundled app — ${paths.rebuildHint}`);
	}
	if (distMtime !== null && plainBinaryMtime !== null) {
		if (distMtime.getTime() > plainBinaryMtime.getTime())
			staleReasons.push(
				`STALE: dist is newer than src-tauri/target/release/quarry — ${paths.rebuildHint}`,
			);
	}
	const stale = staleReasons.length > 0;

	const updater = updaterReport(paths, distMtime, appBinaryMtime);

	const lines: string[] = [];
	lines.push("verify-bundle");
	lines.push(
		`  version   package=${pkgV} cargo=${cargoV} tauri=${tauriV} ${versionMatch ? "MATCH" : "MISMATCH"}`,
	);
	if (artefactOk) lines.push(`  artefact  ${paths.app} (${sizeMiB.toFixed(2)} MiB)`);
	else lines.push(`  artefact  MISSING: ${paths.app} — build with: bun run tauri build`);
	if (artefactOk) lines.push(`  universal ${universal}`);
	lines.push(
		`  freshness dist=${iso(distMtime)} bundle=${iso(appBinaryMtime)} binary=${iso(plainBinaryMtime)}`,
	);
	for (const reason of staleReasons) lines.push(`  ${reason}`);
	lines.push(`  signature ${sigStatus}${binaryExec ? "" : " (binary not executable)"}`);
	lines.push(`  updater   ${updater.detail}`);
	for (const reason of updater.reasons) lines.push(`  ${reason}`);
	lines.push(`  launch    ${launch.detail}`);
	const failed =
		!versionMatch ||
		!artefactOk ||
		!universalOk ||
		!binaryExec ||
		sigStatus.startsWith("FAILED") ||
		!launch.ok ||
		stale ||
		updater.reasons.length > 0;
	lines.push(`  result    ${failed ? "FAIL" : "PASS"}`);
	console.log(lines.join("\n"));
	return failed ? 1 : 0;
}
