/**
 * One file: parse it, expand what is too big, pack the items into parts, and write them out.
 *
 * The output shape is `foo/mod.rs` plus `foo/<name>.rs`; every part starts with the parent's imports
 * and `use super::*`, and `mod.rs` re-exports each of them, so every existing path keeps working.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { LIMIT, TARGET } from "./consts";
import { expand, setBudget } from "./expand";
import { parse } from "./items";
import { uniqueName } from "./names";
import { widen } from "./widen";

export interface SplitOptions {
	dry: boolean;
	verbose: boolean;
}

/** Splits one file; returns the number of failures it reported. */
export function splitFile(file: string, options: SplitOptions): number {
	let failures = 0;
	const source = readFileSync(file, "utf8");
	const { header, items } = parse(source);
	if (items.length === 0) {
		console.error(`no top-level items found in ${file}`);
		return 1;
	}

	const dir = join(dirname(file), basename(file, ".rs"));
	// Every part carries the parent's import block, so it eats into the line budget.
	const importLines = header.filter((line) => {
		const trimmed = line.trimStart();
		return !trimmed.startsWith("//!") && !trimmed.startsWith("#![");
	}).length;
	const target = TARGET - importLines;
	setBudget(target - 6);
	const expanded = items.flatMap(expand);

	const parts: { name: string; body: string[] }[] = [];
	const used = new Set<string>();
	let current: { name: string; body: string[]; lines: number } | null = null;

	for (const item of expanded) {
		if (item.lines > LIMIT) {
			console.error(`cannot split: ${item.name} alone is ${item.lines} lines in ${file}`);
			failures += 1;
		}
		if (options.verbose)
			console.log(
				`  item ${item.name}:${item.lines} cur=${current === null ? "null" : current.lines}`,
			);
		const fits =
			current !== null &&
			current.body.join("\n").split("\n").length + item.lines + 2 <= target;
		if (!fits) {
			current = { name: uniqueName(item.name.toLowerCase(), used), body: [], lines: 0 };
			parts.push({ name: current.name, body: current.body });
		}
		if (current === null) continue;
		current.body.push(widen(item.text), "");
		current.lines = current.body.join("\n").split("\n").length;
		// A `#[cfg(test)]` module has to be the last item in its file.
		if (item.text.includes("#[cfg(test)]") && /\bmod\s+\w+/.test(item.text)) {
			current = null;
		}
	}

	mkdirSync(dir, { recursive: true });
	// Every part needs the parent's imports; multi-line `use` blocks are copied whole.
	const imports = header
		.filter((line) => {
			const trimmed = line.trimStart();
			return !trimmed.startsWith("//!") && !trimmed.startsWith("#![");
		})
		.join("\n");

	// A doc comment that ended a part belongs to the item at the head of the next one; at the very
	// end it may belong to an item that landed elsewhere, so it becomes a plain comment in mod.rs.
	const trailingComments: string[] = [];
	for (let i = 0; i < parts.length; i += 1) {
		const body = parts[i].body;
		while (body.length > 0 && body[body.length - 1].trim() === "") body.pop();
		const move: string[] = [];
		while (body.length > 0 && (body[body.length - 1] ?? "").trimStart().startsWith("///")) {
			const line = body.pop();
			if (line !== undefined) move.unshift(line);
		}
		if (move.length === 0) continue;
		if (i + 1 < parts.length) {
			parts[i + 1].body.unshift(...move);
		} else {
			trailingComments.push(...move.map((line) => line.replace("///", "//")));
		}
	}

	// The parts carry their own copies of the imports, so mod.rs's are only there for the re-exports.
	// The allow attribute has to sit before the first item, which means before those imports.
	const docEnd = header.findIndex((line) => {
		const trimmed = line.trimStart();
		return trimmed !== "" && !trimmed.startsWith("//!") && !trimmed.startsWith("#![");
	});
	const split = docEnd === -1 ? header.length : docEnd;
	// A part may not be named after the module that contains it either.
	const moduleName = basename(dir);
	for (const part of parts) {
		if (part.name === moduleName) part.name = uniqueName(`${moduleName}_core`, used);
	}
	// A part file and an inline module inside it may not share a name.
	for (const part of parts) {
		const body = part.body.join("\n");
		if (
			new RegExp(`(^|\\n)\\s*(pub(\\([^)]*\\))?\\s+)?mod\\s+${part.name}\\s*\\{`).test(body)
		) {
			part.name = uniqueName(`${part.name}_items`, used);
		}
	}

	const mod: string[] = [
		...header.slice(0, split),
		"#![allow(unused_imports)]",
		...header.slice(split),
		"",
	];
	for (const line of trailingComments) mod.push(line);

	for (const part of parts) {
		const body = `#![allow(unused_imports)]\n\n${imports}\n\nuse super::*;\n\n${part.body.join("\n").trimEnd()}\n`;
		if (!options.dry) writeFileSync(join(dir, `${part.name}.rs`), body);
		mod.push(`mod ${part.name};`, `pub use ${part.name}::*;`, "");
	}

	if (!options.dry) {
		writeFileSync(join(dir, "mod.rs"), `${mod.join("\n").trimEnd()}\n`);
		renameSync(file, `${file}.splitting`);
	}
	console.log(`${file}: ${items.length} items -> ${parts.length} parts`);
	if (options.verbose) {
		for (const part of parts) {
			const n = part.body.join("\n").split("\n").length;
			console.log(`  ${part.name}: ${n} lines, ${part.body.length} segments`);
		}
	}
	return failures;
}
