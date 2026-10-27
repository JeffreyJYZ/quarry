/**
 * Report class names used in the debugger UI that no stylesheet defines.
 *
 * Run: bun scripts/unstyled-classes.ts [--exclude path/to.css]
 */

import { Glob } from "bun";

const exclude = new Set<string>();
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 1) {
	if (args[i] === "--exclude" && args[i + 1] !== undefined) {
		exclude.add(args[i + 1] as string);
		i += 1;
	}
}

const defined = new Set<string>();
for await (const file of new Glob("src/**/*.css").scan(".")) {
	if (exclude.has(file)) continue;
	const text = await Bun.file(file).text();
	for (const match of text.matchAll(/\.([a-z][a-z0-9-]*)/g)) {
		if (match[1] !== undefined) defined.add(match[1]);
	}
}

const used = new Map<string, string>();
for await (const file of new Glob("src/ui/debug/**/*.tsx").scan(".")) {
	const text = await Bun.file(file).text();
	for (const match of text.matchAll(/className=(?:"([^"]*)"|\{[^}]*?"([^"]*)"[^}]*?\})/g)) {
		const value = match[1] ?? match[2] ?? "";
		for (const token of value.split(/\s+/)) {
			if (token !== "" && !token.includes("$") && !used.has(token)) used.set(token, file);
		}
	}
}

const missing = [...used.entries()]
	.filter(([name]) => !defined.has(name))
	.sort(([left], [right]) => left.localeCompare(right));

for (const [name, file] of missing) console.log(`${name}  ${file}`);
console.log(`unstyled: ${missing.length} of ${used.size} classes`);
