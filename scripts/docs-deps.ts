#!/usr/bin/env bun
/**
 * The docs site builds with its own dependencies, not the app's.
 *
 * `website/` imports the app's `src/lib` and `src/ui` modules through the `@/` alias, but Vercel
 * installs only `website/package.json`. A bare import inside one of those modules that the website
 * does not declare therefore resolves locally — the app's `node_modules` sits one directory up — and
 * fails only in the build that matters. That is exactly how `@xterm/xterm` reached Vercel.
 *
 * Walk the import graph from the website's entry points into `src/`, fail when any bare specifier
 * is missing from `website/package.json`, and fail when a relative, `~/` or `@/` specifier matches
 * no file at all. An unresolved import used to record nothing, so a misspelled alias passed the
 * gate and only broke the site build.
 */
import { dirname, join, relative, resolve } from "node:path";

const ROOT = join(import.meta.dir, "..");

export type Import = { file: string; specifier: string };

export type GraphResult = {
	files: Set<string>;
	undeclared: Import[];
	unresolved: Import[];
};

/** Package name of a specifier: `@scope/pkg/sub` -> `@scope/pkg`, `react/jsx-runtime` -> `react`. */
export function packageOf(specifier: string): string {
	const parts = specifier.split("/");
	return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** Node and Bun builtins are external by definition, so neither the manifest nor a file has them. */
export function isBuiltin(specifier: string): boolean {
	return specifier.startsWith("node:") || specifier === "bun" || specifier.startsWith("bun:");
}

const IMPORT_PATTERNS = [
	/\bfrom\s+["']([^"']+)["']/g,
	/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
	/^\s*import\s+["']([^"']+)["']/gm,
];

export function importsOf(source: string): string[] {
	const found: string[] = [];
	for (const pattern of IMPORT_PATTERNS) {
		for (const match of source.matchAll(pattern)) found.push(match[1]);
	}
	return found;
}

/** Base path of a local specifier, or null when the specifier is a bare package. */
function baseOf(specifier: string, file: string, root: string, website: string): string | null {
	if (specifier.startsWith(".")) return resolve(dirname(file), specifier);
	if (specifier.startsWith("~/")) return join(website, "src", specifier.slice(2));
	if (specifier.startsWith("@/")) return join(root, "src", specifier.slice(2));
	return null;
}

function candidates(base: string): string[] {
	return [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
}

async function firstExisting(base: string): Promise<string | null> {
	for (const candidate of candidates(base)) {
		if (await Bun.file(candidate).exists()) return candidate;
	}
	return null;
}

async function declaredPackages(website: string): Promise<Set<string>> {
	const manifest = (await Bun.file(join(website, "package.json")).json()) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	return new Set([
		...Object.keys(manifest.dependencies ?? {}),
		...Object.keys(manifest.devDependencies ?? {}),
	]);
}

export async function walkGraph(root: string): Promise<GraphResult> {
	const website = join(root, "website");
	const declared = await declaredPackages(website);
	const result: GraphResult = { files: new Set(), undeclared: [], unresolved: [] };
	const queue: string[] = [];

	for await (const rel of new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: join(website, "src") })) {
		queue.push(join(website, "src", rel));
	}

	while (queue.length > 0) {
		const file = queue.pop() as string;
		if (result.files.has(file)) continue;
		result.files.add(file);
		let source: string;
		try {
			source = await Bun.file(file).text();
		} catch {
			continue;
		}
		for (const specifier of importsOf(source)) {
			if (isBuiltin(specifier)) continue;
			const base = baseOf(specifier, file, root, website);
			if (base !== null) {
				const resolved = await firstExisting(base);
				if (resolved === null) {
					result.unresolved.push({ file: relative(root, file), specifier });
				} else {
					queue.push(resolved);
				}
				continue;
			}
			if (!declared.has(packageOf(specifier))) {
				result.undeclared.push({ file: relative(root, file), specifier });
			}
		}
	}

	return result;
}

export function failureLines(result: GraphResult): string[] {
	const lines: string[] = [];
	if (result.unresolved.length > 0) {
		lines.push("local imports that resolve to no file:");
		for (const entry of result.unresolved) lines.push(`  ${entry.file}: ${entry.specifier}`);
	}
	if (result.undeclared.length > 0) {
		lines.push("the docs site imports packages its manifest does not declare:");
		for (const entry of result.undeclared) lines.push(`  ${entry.file}: ${entry.specifier}`);
	}
	return lines;
}

export type DocsDepsRun = { code: number; lines: string[]; files: number };

/** Walk a repository root that holds both `src/` and `website/`; non-zero means the site breaks. */
export async function run(root: string): Promise<DocsDepsRun> {
	const result = await walkGraph(root);
	const lines = failureLines(result);
	return { code: lines.length > 0 ? 1 : 0, lines, files: result.files.size };
}

if (import.meta.main) {
	const outcome = await run(ROOT);
	if (outcome.code !== 0) {
		for (const line of outcome.lines) console.error(line);
		process.exit(outcome.code);
	}
	console.log(
		`docs dependencies: ${outcome.files} files reachable from website/, all aliases resolved and bare imports declared`,
	);
}
