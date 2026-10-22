#!/usr/bin/env bun
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const APP_PATH = join(ROOT, "src-tauri", "target", "release", "bundle", "macos", "quarry.app");
const APP_BINARY = join(APP_PATH, "Contents", "MacOS", "quarry");

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
function dirSizeMiB(p: string): number {
	const out = execFileSync("du", ["-sk", p], { encoding: "utf8" });
	const kb = Number(out.trim().split(/\s+/)[0]);
	return kb / 1024;
}
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
		} catch (e: any) {
			const msg = `${e.stdout ?? ""} ${e.stderr ?? ""}`.trim();
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

	const lines: string[] = [];
	lines.push("verify-bundle");
	lines.push(
		`  version   package=${pkgV} cargo=${cargoV} tauri=${tauriV} ${versionMatch ? "MATCH" : "MISMATCH"}`,
	);
	if (artefactOk) lines.push(`  artefact  ${APP_PATH} (${sizeMiB.toFixed(2)} MiB)`);
	else lines.push(`  artefact  MISSING: ${APP_PATH} — build with: bun run tauri build`);
	lines.push(`  signature ${sigStatus}${binaryExec ? "" : " (binary not executable)"}`);
	lines.push(`  launch    ${launchDetail}`);
	const failed =
		!versionMatch || !artefactOk || !binaryExec || sigStatus.startsWith("FAILED") || !launchOk;
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
