/**
 * Enforces the repository rule that no source file is longer than 200 lines.
 *
 * Files that were already oversized when the rule arrived are listed in
 * `docs/refactor/oversized.txt`; the check fails when a *new* file crosses the limit and also when
 * a listed file is no longer oversized, so the exception list can only shrink.
 *
 * Usage: bun scripts/check-file-size.ts
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export const LIMIT = 200;

const ROOT = resolve(import.meta.dir, "..");
const LIST = join(ROOT, "docs/refactor/oversized.txt");
const ROOTS = ["src", "src-tauri/src"];
const EXTENSIONS = [".ts", ".tsx", ".css", ".rs"];
const SKIP = new Set(["node_modules", "target", "dist", ".git"]);

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (SKIP.has(entry)) continue;
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) walk(path, out);
		else out.push(path);
	}
	return out;
}

function lineCount(path: string): number {
	const text = readFileSync(path, "utf8");
	if (text === "") return 0;
	const lines = text.split("\n");
	// A trailing newline does not open a new line.
	return lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
}

const allowed = new Set(
	readFileSync(LIST, "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "" && !line.startsWith("#")),
);

const oversized: { file: string; lines: number }[] = [];

for (const root of ROOTS) {
	for (const file of walk(join(ROOT, root))) {
		if (!EXTENSIONS.includes(file.slice(file.lastIndexOf(".")))) continue;
		const lines = lineCount(file);
		if (lines <= LIMIT) continue;
		oversized.push({ file: relative(ROOT, file), lines });
	}
}

const saved = [...allowed].filter((file) => !oversized.some((entry) => entry.file === file));
const fresh = oversized.filter((entry) => !allowed.has(entry.file));

for (const entry of fresh.sort((a, b) => b.lines - a.lines)) {
	console.error(`over ${LIMIT} lines: ${entry.file} (${entry.lines})`);
}

for (const file of saved) {
	console.error(`listed in oversized.txt but now within ${LIMIT} lines: ${file}`);
	console.error("  remove it from docs/refactor/oversized.txt");
}

if (fresh.length > 0 || saved.length > 0) {
	console.error(
		`\n${fresh.length} new oversized file(s), ${saved.length} stale exception(s); limit is ${LIMIT} lines`,
	);
	process.exit(1);
}

console.log(`${oversized.length} oversized file(s) remain on the exception list`);
