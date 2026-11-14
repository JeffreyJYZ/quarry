/**
 * Reading a build tree: what it wrote, and how a path inside it is spelled in the report.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Every file named `name` under `root`, so a finding can say where a build actually wrote it. */
export function findExecutables(root: string, name: string, depth = 0): string[] {
	if (depth > 4) return [];
	const found: string[] = [];
	for (const entry of readdirSync(root)) {
		const path = join(root, entry);
		let stat: ReturnType<typeof statSync>;
		try {
			stat = statSync(path);
		} catch {
			continue;
		}
		if (stat.isDirectory()) found.push(...findExecutables(path, name, depth + 1));
		else if (entry === name && stat.isFile()) found.push(path);
	}
	return found;
}

/** Every file named `name` under `root`, so a configuration's own object can be found. */
export function findNamed(root: string, name: string, depth = 0): string[] {
	if (depth > 5) return [];
	const found: string[] = [];
	for (const entry of readdirSync(root)) {
		const path = join(root, entry);
		let stat: ReturnType<typeof statSync>;
		try {
			stat = statSync(path);
		} catch {
			continue;
		}
		if (stat.isDirectory()) found.push(...findNamed(path, name, depth + 1));
		else if (entry === name && stat.isFile()) found.push(path);
	}
	return found;
}

/** Whether the build wrote exactly this executable, and nothing of that name was there before. */
export function wroteExecutable(root: string, name: string): boolean {
	return findExecutables(root, name, 0).length === 1;
}

/** A path with the fixture root written as `.`, for a detail line. */
export function relativeTo(root: string, path: string): string {
	const norm = (value: string) => value.replaceAll("\\", "/");
	const base = `${norm(root)}/`;
	const full = norm(path);
	return full.startsWith(base) ? full.slice(base.length) : path;
}
