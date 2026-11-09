/**
 * Report class names used in the shell that no stylesheet defines.
 *
 * Run: bun scripts/unstyled-classes.ts [--exclude path/to.css]
 *
 * Exits non-zero when a class is used and never styled, so a restructure that drops a rule is
 * caught instead of silently flattening an element.
 *
 * The first version of this only read `src/ui/debug/**` and only matched a lone double-quoted
 * `className="…"`, so `className={cond ? "a" : "b"}`, template literals and every component outside
 * the debugger were never checked. `0 unstyled` was a property of one subtree, not of the app.
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

/** Class names any stylesheet selects. */
const defined = new Set<string>();
for await (const file of new Glob("src/**/*.css").scan(".")) {
	if (exclude.has(file)) continue;
	const text = await Bun.file(file).text();
	for (const match of text.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
		const name = match[1];
		if (name !== undefined) defined.add(name);
	}
}

/**
 * The text between `className=` and the end of its expression.
 *
 * A JSX attribute is either a quoted string or a braced expression, and a braced expression can hold
 * braces of its own (`{cond ? {a: 1}.a : ""}`) and strings containing `}`. Scanning for balanced
 * braces while skipping quoted text is the smallest thing that gets all three right.
 */
function expressions(text: string): string[] {
	const out: string[] = [];
	const marker = "className=";
	let index = 0;
	while (true) {
		const start = text.indexOf(marker, index);
		if (start === -1) break;
		const from = start + marker.length;
		const head = text[from];
		if (head === '"' || head === "'") {
			const end = text.indexOf(head, from + 1);
			if (end === -1) break;
			// Keep the quotes: `literals` reads quoted text, and a bare `className="a b"` is quoted.
			out.push(text.slice(from, end + 1));
			index = end + 1;
			continue;
		}
		if (head === "{") {
			let depth = 0;
			let quote: string | null = null;
			let cursor = from;
			for (; cursor < text.length; cursor += 1) {
				const char = text[cursor];
				if (quote !== null) {
					if (char === "\\") {
						cursor += 1;
						continue;
					}
					if (char === quote) quote = null;
					continue;
				}
				if (char === '"' || char === "'" || char === "`") {
					quote = char;
					continue;
				}
				if (char === "{") depth += 1;
				else if (char === "}") {
					depth -= 1;
					if (depth === 0) break;
				}
			}
			out.push(text.slice(from + 1, cursor));
			index = cursor + 1;
			continue;
		}
		index = from;
	}
	return out;
}

/** Every static string in an expression, with a template literal's `${…}` holes cut out. */
function literals(raw: string): string[] {
	// A comparison is not a class: `className={placement === "right" ? … }` must not report `right`.
	const expression = raw.replace(/(?:===|!==|==|!=)\s*(?:"[^"\n]*"|'[^'\n]*')/g, "");
	const out: string[] = [];
	for (const match of expression.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
		const value = match[1] ?? match[2] ?? match[3];
		if (value === undefined) continue;
		if (match[3] !== undefined) {
			for (const segment of value.split(/\$\{[^}]*\}/)) out.push(segment);
			continue;
		}
		out.push(value);
	}
	return out;
}

const used = new Map<string, string>();
for await (const file of new Glob("src/ui/**/*.tsx").scan(".")) {
	const text = await Bun.file(file).text();
	for (const expression of expressions(text)) {
		for (const value of literals(expression)) {
			for (const token of value.split(/\s+/)) {
				// A template hole leaves a fragment behind (`splitter-${side}` gives `splitter-`).
				if (token === "" || token.endsWith("-") || token.includes("$")) continue;
				if (/\W/.test(token.replace(/-/g, ""))) continue;
				if (!used.has(token)) used.set(token, file);
			}
		}
	}
}

const missing = [...used.entries()]
	.filter(([name]) => !defined.has(name))
	.sort(([left], [right]) => left.localeCompare(right));

for (const [name, file] of missing) console.log(`${name}  ${file}`);
console.log(`unstyled: ${missing.length} of ${used.size} classes`);
if (missing.length > 0) process.exit(1);
