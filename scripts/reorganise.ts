/**
 * One-shot migration: split `src/` into `src/lib` (logic) and `src/ui` (components, styles).
 *
 * Files ending in `.ts` are logic and go under `lib/`; `.tsx` and `.css` are UI and go under
 * `ui/`. The feature directory is preserved on both sides, so `editor/theme.ts` becomes
 * `lib/editor/theme.ts` while `editor/Editor.tsx` becomes `ui/editor/Editor.tsx`.
 *
 * Every import is rewritten to the `@/` alias, which removes the relative-path churn that moving
 * files would otherwise cause. Run it once; it is not part of the build.
 *
 * Usage: bun scripts/reorganise.ts [--dry]
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SRC = join(ROOT, "src");
const dry = process.argv.includes("--dry");
const verbose = process.argv.includes("--verbose");

type Move = { from: string; to: string };

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) walk(path, out);
		else out.push(path);
	}
	return out;
}

function bucket(path: string): "lib" | "ui" | null {
	const name = path.slice(SRC.length + 1);
	if (name.endsWith(".d.ts")) return null;
	if (name.endsWith(".ts")) return "lib";
	if (name.endsWith(".tsx") || name.endsWith(".css")) return "ui";
	return null;
}

const files = walk(SRC);
const moves: Move[] = [];
for (const file of files) {
	const where = bucket(file);
	if (where === null) continue;
	const name = file.slice(SRC.length + 1);
	// Already in place from a previous run.
	if (name.startsWith(`${where}/`)) continue;
	moves.push({ from: file, to: join(SRC, where, name) });
}

const newPathOf = new Map<string, string>();
for (const move of moves) newPathOf.set(move.from, move.to);

/**
 * A file's pre-migration location: `lib/editor/theme.ts` was `editor/theme.ts` and
 * `ui/editor/Editor.tsx` was `editor/Editor.tsx`. Reconstructing it lets a second run resolve
 * imports that the first one left alone.
 */
function oldNameOf(file: string): string {
	const name = relative(SRC, file).split("\\").join("/");
	return name.replace(/^(lib|ui)\//, "");
}

const oldToNew = new Map<string, string>();
for (const file of files) oldToNew.set(join(SRC, oldNameOf(file)), file);

const extensions = ["", ".ts", ".tsx", ".css", ".json"];

/** Resolve a specifier to the migrated file it means, using pre-migration paths. */
function resolveTarget(from: string, specifier: string): string | null {
	const base = specifier.startsWith("@/")
		? join(SRC, specifier.slice(2))
		: specifier.startsWith(".")
			? resolve(dirname(join(SRC, oldNameOf(from))), specifier)
			: null;
	if (base === null) return null;
	for (const ext of extensions) {
		const next = oldToNew.get(base + ext);
		if (next !== undefined) return next;
	}
	for (const ext of extensions.filter((e) => e !== "")) {
		const next = oldToNew.get(join(base, `index${ext}`));
		if (next !== undefined) return next;
	}
	return null;
}

function aliasFor(file: string): string {
	const name = relative(SRC, file).split("\\").join("/");
	if (name.endsWith(".ts") || name.endsWith(".tsx")) return `@/${name.replace(/\.tsx?$/, "")}`;
	return `@/${name}`;
}

const importPattern = /(from\s+["']|import\s+["'])([^"']+)(["'])/g;
const dynamicPattern = /(import\(\s*["'])([^"']+)(["']\s*\))/g;
const cssPattern = /(@import\s+["'])([^"']+)(["'])/g;

let rewrites = 0;
let unresolved = 0;

function rewrite(file: string, source: string, pattern: RegExp): string {
	return source.replace(pattern, (whole, head: string, specifier: string, tail: string) => {
		if (specifier.startsWith("http")) return whole;
		const target = resolveTarget(file, specifier);
		if (target === null) {
			unresolved += 1;
			if (verbose) console.log(`unresolved: ${relative(ROOT, file)} -> ${specifier}`);
			return whole;
		}
		const next = aliasFor(target);
		if (next !== specifier) rewrites += 1;
		return `${head}${next}${tail}`;
	});
}

for (const file of files) {
	const ext = extname(file);
	if (![".ts", ".tsx", ".css"].includes(ext)) continue;
	const source = readFileSync(file, "utf8");
	const rewritten = rewrite(
		file,
		rewrite(file, rewrite(file, source, importPattern), dynamicPattern),
		cssPattern,
	);
	if (rewritten === source) continue;
	if (!dry) writeFileSync(file, rewritten);
}

const { spawnSync } = await import("node:child_process");
if (!dry) {
	for (const move of moves) {
		spawnSync("mkdir", ["-p", dirname(move.to)]);
		const tracked = spawnSync("git", ["ls-files", "--error-unmatch", move.from], { cwd: ROOT });
		const args = tracked.status === 0 ? ["mv", move.from, move.to] : ["-f", move.from, move.to];
		const command = tracked.status === 0 ? "git" : "mv";
		const result = spawnSync(command, args, { cwd: ROOT });
		if (result.status !== 0) {
			console.error(`move failed: ${move.from} -> ${move.to}`);
			process.exit(1);
		}
	}
}

console.log(
	`${dry ? "would move" : "moved"} ${moves.length} files, rewrote ${rewrites} imports, ${unresolved} unresolved`,
);
