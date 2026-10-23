#!/usr/bin/env bun
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const APP_PATH = join(ROOT, "src-tauri", "target", "release", "bundle", "macos", "quarry.app");
const APP_BINARY = join(APP_PATH, "Contents", "MacOS", "quarry");
const PLAIN_BINARY = join(ROOT, "src-tauri", "target", "release", "quarry");
const UPDATER_TAR = join(
	ROOT,
	"src-tauri",
	"target",
	"release",
	"bundle",
	"macos",
	"quarry.app.tar.gz",
);
const UPDATER_SIG = `${UPDATER_TAR}.sig`;
const DIST_DIR = join(ROOT, "dist");
const REBUILD_HINT = "run: bun run tauri build --bundles app";

function readPackageVersion(): string {
	const raw = readFileSync(join(ROOT, "package.json"), "utf8");
	return (JSON.parse(raw) as { version: string }).version;
}
function readCargoVersion(): string {
	const raw = readFileSync(join(ROOT, "src-tauri", "Cargo.toml"), "utf8");
	const m = /^version\s*=\s*"([^"]+)"/m.exec(raw);
	if (!m) throw new Error("cargo version not found");
	return m[1];
}
function readTauriVersion(): string {
	const raw = readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf8");
	return (JSON.parse(raw) as { version: string }).version;
}
/** Whether the build must produce updater artefacts, and whether a public key is baked in. */
function readUpdaterConfig(): { artifacts: boolean; pubkey: string | null } {
	const raw = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf8")) as {
		bundle?: { createUpdaterArtifacts?: boolean | string };
		plugins?: { updater?: { pubkey?: string } };
	};
	return {
		artifacts: raw.bundle?.createUpdaterArtifacts === true,
		pubkey: raw.plugins?.updater?.pubkey ?? null,
	};
}
/** Tauri's `.sig` is base64 of a minisign blob; an empty or truncated file fails here. */
function signatureOk(path: string): boolean {
	if (!existsSync(path)) return false;
	const text = readFileSync(path, "utf8").trim();
	if (text === "") return false;
	return Buffer.from(text, "base64").toString("utf8").includes("untrusted comment");
}
function dirSizeMiB(p: string): number {
	const out = execFileSync("du", ["-sk", p], { encoding: "utf8" });
	const kb = Number(out.trim().split(/\s+/)[0]);
	return kb / 1024;
}
/** Newest file mtime under `dir`, or null when the directory is absent. */
function newestFile(dir: string): { path: string; mtime: Date } | null {
	if (!existsSync(dir)) return null;
	let newest: { path: string; mtime: Date } | null = null;
	const stack: string[] = [dir];
	while (stack.length > 0) {
		const current = stack.pop();
		if (current === undefined) break;
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const p = join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(p);
			} else if (entry.isFile()) {
				const mtime = statSync(p).mtime;
				if (newest === null || mtime.getTime() > newest.mtime.getTime())
					newest = { path: p, mtime };
			}
		}
	}
	return newest;
}
function mtimeOf(p: string): Date | null {
	return existsSync(p) ? statSync(p).mtime : null;
}
const iso = (d: Date | null) => (d === null ? "absent" : d.toISOString());
function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main(): Promise<number> {
	const pkgV = readPackageVersion();
	const cargoV = readCargoVersion();
	const tauriV = readTauriVersion();
	const versionMatch = pkgV === cargoV && cargoV === tauriV;

	let artefactOk = false;
	let sizeMiB = 0;
	if (existsSync(APP_PATH)) {
		artefactOk = true;
		sizeMiB = dirSizeMiB(APP_PATH);
	}

	let binaryExec = false;
	let sigStatus = "not checked";
	if (artefactOk) {
		try {
			execFileSync("test", ["-x", APP_BINARY]);
			binaryExec = true;
		} catch {
			binaryExec = false;
		}
		try {
			execFileSync("codesign", ["--verify", "--deep", "--strict", APP_PATH], {
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

	let launchOk = false;
	let launchDetail = "not attempted";
	let child: ReturnType<typeof spawn> | null = null;
	let pid: number | null = null;
	try {
		if (artefactOk && binaryExec) {
			child = spawn(APP_BINARY, [], { detached: true, stdio: "ignore" });
			pid = child.pid ?? null;
			if (!pid) throw new Error("spawn returned no pid");
			const start = Date.now();
			let appeared = false;
			while (Date.now() - start < 10_000) {
				if (isAlive(pid)) {
					appeared = true;
					break;
				}
				await sleep(50);
			}
			if (!appeared) {
				launchDetail = "never appeared";
			} else {
				await sleep(200);
				if (!isAlive(pid)) {
					launchDetail = "crashed within window";
				} else {
					try {
						process.kill(pid, "SIGTERM");
					} catch {}
					let exited = false;
					const qStart = Date.now();
					while (Date.now() - qStart < 5_000) {
						if (!isAlive(pid)) {
							exited = true;
							break;
						}
						await sleep(50);
					}
					if (!exited) {
						try {
							process.kill(pid, "SIGKILL");
						} catch {}
						await sleep(200);
						exited = !isAlive(pid);
					}
					if (exited) {
						launchOk = true;
						launchDetail = `appeared, exited cleanly (${Date.now() - start}ms)`;
					} else {
						launchDetail = "did not exit";
					}
				}
			}
		} else {
			launchDetail = "skipped (missing/non-executable artefact)";
		}
	} finally {
		if (pid !== null && isAlive(pid)) {
			try {
				process.kill(pid, "SIGKILL");
			} catch {}
		}
		if (child) {
			try {
				child.kill("SIGKILL");
			} catch {}
		}
	}

	// Freshness: only `tauri build` copies the current `dist/` into the `.app`. A plain
	// `bun run build` plus `cargo build --release` refreshes `dist/` and the loose binary
	// while the bundle keeps its old binary, so a launch silently runs stale UI.
	const distNewest = newestFile(DIST_DIR);
	const distMtime = distNewest?.mtime ?? null;
	const appBinaryMtime = mtimeOf(APP_BINARY);
	const plainBinaryMtime = mtimeOf(PLAIN_BINARY);
	const staleReasons: string[] = [];
	if (distMtime !== null && appBinaryMtime !== null) {
		if (distMtime.getTime() > appBinaryMtime.getTime())
			staleReasons.push(`STALE: dist is newer than the bundled app — ${REBUILD_HINT}`);
	}
	if (distMtime !== null && plainBinaryMtime !== null) {
		if (distMtime.getTime() > plainBinaryMtime.getTime())
			staleReasons.push(
				`STALE: dist is newer than src-tauri/target/release/quarry — ${REBUILD_HINT}`,
			);
	}
	const stale = staleReasons.length > 0;

	// Updater artefacts: an installed app updates only from a signed archive beside a
	// `latest.json`, so a missing or stale pair means the release cannot be installed.
	const updaterConfig = readUpdaterConfig();
	const updaterReasons: string[] = [];
	let updaterDetail = "not configured";
	if (updaterConfig.artifacts) {
		const tarMtime = mtimeOf(UPDATER_TAR);
		const sigOk = signatureOk(UPDATER_SIG);
		if (tarMtime === null) {
			updaterReasons.push(
				`MISSING updater archive: ${UPDATER_TAR} — ${REBUILD_HINT} with TAURI_SIGNING_PRIVATE_KEY set`,
			);
		}
		if (!sigOk) {
			updaterReasons.push(`MISSING or unreadable updater signature: ${UPDATER_SIG}`);
		}
		if (distMtime !== null && tarMtime !== null && distMtime.getTime() > tarMtime.getTime()) {
			updaterReasons.push(`STALE: dist is newer than the updater archive — ${REBUILD_HINT}`);
		}
		if (
			appBinaryMtime !== null &&
			tarMtime !== null &&
			appBinaryMtime.getTime() > tarMtime.getTime()
		) {
			updaterReasons.push(
				`STALE: the bundled app is newer than the updater archive — ${REBUILD_HINT}`,
			);
		}
		if (updaterConfig.pubkey === null || updaterConfig.pubkey.trim() === "") {
			updaterReasons.push("MISSING plugins.updater.pubkey in src-tauri/tauri.conf.json");
		}
		const size =
			tarMtime === null
				? "absent"
				: `${(statSync(UPDATER_TAR).size / 1024 / 1024).toFixed(2)} MiB`;
		updaterDetail = `${size} sig=${sigOk ? "present" : "absent"}`;
	}

	const lines: string[] = [];
	lines.push("verify-bundle");
	lines.push(
		`  version   package=${pkgV} cargo=${cargoV} tauri=${tauriV} ${versionMatch ? "MATCH" : "MISMATCH"}`,
	);
	if (artefactOk) lines.push(`  artefact  ${APP_PATH} (${sizeMiB.toFixed(2)} MiB)`);
	else lines.push(`  artefact  MISSING: ${APP_PATH} — build with: bun run tauri build`);
	lines.push(
		`  freshness dist=${iso(distMtime)} bundle=${iso(appBinaryMtime)} binary=${iso(plainBinaryMtime)}`,
	);
	for (const reason of staleReasons) lines.push(`  ${reason}`);
	lines.push(`  signature ${sigStatus}${binaryExec ? "" : " (binary not executable)"}`);
	lines.push(`  updater   ${updaterDetail}`);
	for (const reason of updaterReasons) lines.push(`  ${reason}`);
	lines.push(`  launch    ${launchDetail}`);
	const failed =
		!versionMatch ||
		!artefactOk ||
		!binaryExec ||
		sigStatus.startsWith("FAILED") ||
		!launchOk ||
		stale ||
		updaterReasons.length > 0;
	lines.push(`  result    ${failed ? "FAIL" : "PASS"}`);
	console.log(lines.join("\n"));
	return failed ? 1 : 0;
}

main()
	.then((code) => process.exit(code))
	.catch((err) => {
		console.error(err instanceof Error ? err.message : String(err));
		process.exit(1);
	});
