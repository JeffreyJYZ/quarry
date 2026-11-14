/**
 * "Does the built app launch?" — a start, a survival window, and a clean exit.
 *
 * The app is spawned detached because a bundle that is already running is a different failure from
 * one that crashes at startup, and both must end with nothing left behind.
 */

import { type ChildProcess, spawn } from "node:child_process";

export function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface LaunchReport {
	ok: boolean;
	detail: string;
}

export async function probeLaunch(appBinary: string, allowed: boolean): Promise<LaunchReport> {
	if (!allowed) return { ok: false, detail: "skipped (missing/non-executable artefact)" };

	let child: ChildProcess | null = null;
	let pid: number | null = null;
	try {
		child = spawn(appBinary, [], { detached: true, stdio: "ignore" });
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
		if (!appeared) return { ok: false, detail: "never appeared" };

		await sleep(200);
		if (!isAlive(pid)) return { ok: false, detail: "crashed within window" };

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
		if (exited)
			return { ok: true, detail: `appeared, exited cleanly (${Date.now() - start}ms)` };
		return { ok: false, detail: "did not exit" };
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
}
