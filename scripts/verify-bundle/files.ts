/**
 * Filesystem facts a bundle check needs: how big a directory is, and which of two files is newer.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export function dirSizeMiB(path: string): number {
	const out = execFileSync("du", ["-sk", path], { encoding: "utf8" });
	const kb = Number(out.trim().split(/\s+/)[0]);
	return kb / 1024;
}

/** Newest file mtime under `dir`, or null when the directory is absent. */
export function newestFile(dir: string): { path: string; mtime: Date } | null {
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

export function mtimeOf(path: string): Date | null {
	return existsSync(path) ? statSync(path).mtime : null;
}

export const iso = (d: Date | null) => (d === null ? "absent" : d.toISOString());
