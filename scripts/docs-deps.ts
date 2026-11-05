#!/usr/bin/env bun
/**
 * The docs site builds with its own dependencies, not the app's.
 *
 * `website/` imports the app's `src/lib` and `src/ui` modules through the `@/` alias, but Vercel
 * installs only `website/package.json`. A bare import inside one of those modules that the website
 * does not declare therefore resolves locally — the app's `node_modules` sits one directory up — and
 * fails only in the build that matters. That is exactly how `@xterm/xterm` reached Vercel.
 *
 * Walk the import graph from the website's entry points into `src/`, and fail when any bare specifier
 * is missing from `website/package.json`.
 */
import { dirname, join, relative, resolve } from "node:path";

const ROOT = join(import.meta.dir, "..");
const WEBSITE = join(ROOT, "website");
const SITE_ENTRY = join(WEBSITE, "src");

const manifest = (await Bun.file(join(WEBSITE, "package.json")).json()) as {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
};
const declared = new Set([
	...Object.keys(manifest.dependencies ?? {}),
	...Object.keys(manifest.devDependencies ?? {}),
]);

/** Package name of a specifier: `@scope/pkg/sub` -> `@scope/pkg`, `react/jsx-runtime` -> `react`. */
function packageOf(specifier: string): string {
	const parts = specifier.split("/");
	return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function isBuiltin(specifier: string): boolean {
	return specifier.startsWith("node:") || specifier === "bun" || specifier.startsWith("bun:");
}

const IMPORT_PATTERNS = [
	/\bfrom\s+["']([^"']+)["']/g,
	/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
	/^\s*import\s+["']([^"']+)["']/gm,
];

function importsOf(source: string): string[] {
	const found: string[] = [];
	for (const pattern of IMPORT_PATTERNS) {
		for (const match of source.matchAll(pattern)) found.push(match[1]);
	}
	return found;
}

const files = new Set<string>();
const offenders: { file: string; specifier: string }[] = [];
const queue: string[] = [];

for await (const rel of new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: SITE_ENTRY })) {
	queue.push(join(SITE_ENTRY, rel));
}

while (queue.length > 0) {
	const file = queue.pop() as string;
	if (files.has(file)) continue;
	files.add(file);
	let source: string;
	try {
		source = await Bun.file(file).text();
	} catch {
		continue;
	}
	for (const specifier of importsOf(source)) {
		if (isBuiltin(specifier)) continue;
		if (specifier.startsWith(".")) {
			const base = resolve(dirname(file), specifier);
			for (const candidate of [
				base,
				`${base}.ts`,
				`${base}.tsx`,
				join(base, "index.ts"),
				join(base, "index.tsx"),
			]) {
				if (await Bun.file(candidate).exists()) {
					queue.push(candidate);
					break;
				}
			}
			continue;
		}
		if (specifier.startsWith("~/")) {
			const base = join(WEBSITE, "src", specifier.slice(2));
			for (const candidate of [
				base,
				`${base}.ts`,
				`${base}.tsx`,
				join(base, "index.ts"),
				join(base, "index.tsx"),
			]) {
				if (await Bun.file(candidate).exists()) {
					queue.push(candidate);
					break;
				}
			}
			continue;
		}
		if (specifier.startsWith("@/")) {
			const base = join(ROOT, "src", specifier.slice(2));
			for (const candidate of [
				base,
				`${base}.ts`,
				`${base}.tsx`,
				join(base, "index.ts"),
				join(base, "index.tsx"),
			]) {
				if (await Bun.file(candidate).exists()) {
					queue.push(candidate);
					break;
				}
			}
			continue;
		}
		if (!declared.has(packageOf(specifier))) {
			offenders.push({ file: relative(ROOT, file), specifier });
		}
	}
}

if (offenders.length > 0) {
	console.error("the docs site imports packages its manifest does not declare:");
	for (const offender of offenders) {
		console.error(`  ${offender.file}: ${offender.specifier}`);
	}
	process.exit(1);
}

console.log(
	`docs dependencies: ${files.size} files reachable from website/, all bare imports declared`,
);
