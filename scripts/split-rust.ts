/**
 * Splits a Rust source file into a module directory, cutting only between top-level items.
 *
 * `foo.rs` becomes `foo/mod.rs` plus `foo/<name>.rs` children. Every child starts with
 * `#![allow(unused_imports)]`, the parent's imports, and `use super::*;`, so it sees the same names.
 * Items are widened to `pub` (fields to `pub(crate)`) so siblings and the re-exports can reach them,
 * and `mod.rs` re-exports each child with `pub use child::*;`, so every existing `crate::foo::X`
 * path keeps working.
 *
 * Items larger than the limit are expanded first: an `impl` block becomes several `impl` blocks for
 * the same type (legal Rust), and an inline `mod tests { ... }` becomes several numbered test
 * modules. A single function that large is reported instead of being cut.
 *
 * Usage: bun scripts/split-rust.ts src-tauri/src/foo.rs [--dry]
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const LIMIT = 200;
const TARGET = 150;
const dry = process.argv.includes("--dry");

/** Room a single expanded item may take, once the import block and wrapper are accounted for. */
let budget = TARGET;

/** Lexer state that has to survive a line boundary: strings and block comments can span lines. */
type LexState = {
	inString: boolean;
	inRaw: number | null;
	inBlockComment: number;
	inChar: boolean;
};

function blankLiterals(line: string, state: LexState): string {
	let out = "";
	let index = 0;
	while (index < line.length) {
		const char = line[index];
		const next = line[index + 1];
		if (state.inBlockComment > 0) {
			if (char === "/" && next === "*") {
				state.inBlockComment += 1;
				index += 2;
				continue;
			}
			if (char === "*" && next === "/") {
				state.inBlockComment -= 1;
				index += 2;
				continue;
			}
			index += 1;
			continue;
		}
		if (state.inRaw !== null) {
			const closer = `"${"#".repeat(state.inRaw)}`;
			if (line.startsWith(closer, index)) {
				index += closer.length;
				state.inRaw = null;
				continue;
			}
			index += 1;
			continue;
		}
		if (state.inString) {
			if (char === "\\") {
				index += 2;
				continue;
			}
			if (char === '"') state.inString = false;
			index += 1;
			continue;
		}
		if (state.inChar) {
			if (char === "\\") {
				index += 2;
				continue;
			}
			if (char === "'") state.inChar = false;
			index += 1;
			continue;
		}
		if (char === "/" && next === "/") break;
		if (char === "/" && next === "*") {
			state.inBlockComment = 1;
			index += 2;
			continue;
		}
		if (char === "r" && (next === '"' || next === "#")) {
			const match = line.slice(index).match(/^r(#*)"/);
			if (match) {
				const hashes = match[1].length;
				const rest = line.slice(index + 2 + hashes);
				const end = rest.indexOf(`"${"#".repeat(hashes)}`);
				if (end === -1) {
					state.inRaw = hashes;
					return out;
				}
				index += 2 + hashes + end + 1 + hashes;
				continue;
			}
		}
		if (char === '"') {
			state.inString = true;
			index += 1;
			continue;
		}
		if (char === "'") {
			// A character literal — `'a'`, `'\n'` — but not a lifetime like `'static`.
			const literal = line.slice(index).match(/^'(?:\\.|[^'\\])'/);
			if (literal !== null) {
				index += literal[0].length;
				continue;
			}
		}
		out += char;
		index += 1;
	}
	return out;
}

type Item = { name: string; text: string; lines: number };
type Depth = { round: number; curly: number; square: number };

function countDepth(line: string, depth: Depth): void {
	for (const char of line) {
		if (char === "(") depth.round += 1;
		else if (char === ")") depth.round -= 1;
		else if (char === "{") depth.curly += 1;
		else if (char === "}") depth.curly -= 1;
		else if (char === "[") depth.square += 1;
		else if (char === "]") depth.square -= 1;
	}
}

function lineCount(text: string): number {
	return text.split("\n").length;
}

function itemName(lines: string[], index: number): string {
	for (let i = index; i < Math.min(index + 12, lines.length); i += 1) {
		const line = lines[i];
		const match = line.match(
			/^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:fn|struct|enum|union|trait|type|const|static|mod)\s+([A-Za-z_][A-Za-z0-9_]*)/,
		);
		if (match) return match[1];
		const implMatch = line.match(
			/^impl(?:<[^>]*>)?\s+(?:[A-Za-z_][A-Za-z0-9_:<>]*\s+for\s+)?([A-Za-z_][A-Za-z0-9_]*)/,
		);
		if (implMatch) return `impl_${implMatch[1]}`;
	}
	return "items";
}

function firstCodeIndex(lines: string[]): number {
	return lines.findIndex((line) => {
		const trimmed = line.trim();
		return (
			trimmed !== "" &&
			!trimmed.startsWith("#[") &&
			!trimmed.startsWith("///") &&
			!trimmed.startsWith("//")
		);
	});
}

function splitItems(source: string): Item[] {
	const lines = source.split("\n");
	const items: Item[] = [];
	let index = 0;
	while (index < lines.length) {
		if (lines[index].trim() === "") {
			index += 1;
			continue;
		}
		const start = index;
		const name = itemName(lines, index);
		const depth: Depth = { round: 0, curly: 0, square: 0 };
		const lex: LexState = { inString: false, inRaw: null, inBlockComment: 0, inChar: false };
		let sawBody = false;
		while (index < lines.length) {
			const code = blankLiterals(lines[index], lex);
			countDepth(code, depth);
			if (code.includes("{")) sawBody = true;
			// A doc comment ending in `;` does not end the item it documents.
			const isComment = lines[index].trimStart().startsWith("//");
			const done =
				!isComment &&
				((sawBody && depth.curly === 0 && depth.round === 0) ||
					(!sawBody &&
						depth.round === 0 &&
						depth.square === 0 &&
						lines[index].trimEnd().endsWith(";")));
			index += 1;
			if (done) break;
		}
		const text = lines.slice(start, index).join("\n");
		items.push({ name, text, lines: lineCount(text) });
	}
	return items;
}

function parse(source: string): { header: string[]; items: Item[] } {
	const lines = source.split("\n");
	const header: string[] = [];
	let index = 0;

	// Module docs and inner attributes belong to mod.rs.
	while (index < lines.length) {
		const trimmed = lines[index].trim();
		if (trimmed === "" || trimmed.startsWith("//!") || trimmed.startsWith("#![")) {
			header.push(lines[index]);
			index += 1;
			continue;
		}
		break;
	}

	const rest = splitItems(lines.slice(index).join("\n"));
	const items: Item[] = [];
	for (const item of rest) {
		const block = item.text.split("\n");
		const codeIndex = firstCodeIndex(block);
		const code = block[codeIndex]?.trim() ?? "";
		// An inner attribute only means something at the top of the module, so it belongs in mod.rs.
		if (code.startsWith("#![")) {
			header.push(...block);
			continue;
		}
		// Imports stay in mod.rs; other children reach them through `use super::*`.
		if (code.startsWith("use ") || code.startsWith("pub use ")) {
			if (!code.startsWith("pub ")) {
				block[codeIndex] =
					`${code.startsWith("use crate::") ? "pub(crate) " : "pub "}${code}`;
			}
			header.push(...block);
			continue;
		}
		items.push(item);
	}

	while (header.length > 0 && header[header.length - 1].trim() === "") header.pop();
	return { header, items };
}

function widenFields(text: string): string {
	const lines = text.split("\n");
	const open = lines.findIndex((line) => line.trim().endsWith("{"));
	if (open === -1) return text;
	let depth = 0;
	for (let i = open; i < lines.length; i += 1) {
		const line = lines[i];
		if (
			i > open &&
			depth === 1 &&
			/^\s+[a-z_][A-Za-z0-9_]*:/.test(line) &&
			!line.trim().startsWith("pub")
		) {
			lines[i] = line.replace(/^(\s+)/, "$1pub(crate) ");
		}
		for (const char of line) {
			if (char === "{") depth += 1;
			else if (char === "}") depth -= 1;
		}
	}
	return lines.join("\n");
}

/** Widens an inherent method so the parent module's command wrappers can call it. */
function widenMethods(text: string): string {
	const lines = text.split("\n");
	// Trait impls (`impl Debug for Session`) cannot carry method visibility.
	const header = lines.find((line) => line.trimStart().startsWith("impl")) ?? "";
	if (header.includes(" for ")) return text;
	let depth = 0;
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if (
			depth === 1 &&
			/^\s{4,}(?:async\s+)?(?:unsafe\s+)?fn\s+[a-z_]/.test(line) &&
			!line.trim().startsWith("pub")
		) {
			lines[i] = line.replace(/^(\s+)/, "$1pub(crate) ");
		}
		for (const char of line) {
			if (char === "{") depth += 1;
			else if (char === "}") depth -= 1;
		}
	}
	return lines.join("\n");
}

/** Widens a top-level item, and a struct's fields, so a sibling module can use them. */
function widen(text: string): string {
	const lines = text.split("\n");
	for (let i = 0; i < lines.length; i += 1) {
		const trimmed = lines[i].trim();
		if (
			trimmed === "" ||
			trimmed.startsWith("#[") ||
			trimmed.startsWith("///") ||
			trimmed.startsWith("//")
		) {
			continue;
		}
		if (/^(pub(\([^)]*\))?\s+)?impl\b/.test(trimmed)) return widenMethods(text);
		if (/^pub(\([^)]*\))?\s+(struct|enum|union)\b/.test(trimmed)) return widenFields(text);
		if (/^pub(\([^)]*\))?\s/.test(trimmed)) return text;
		if (/^(struct|enum|union)\b/.test(trimmed)) {
			lines[i] = `pub ${lines[i]}`;
			return widenFields(lines.join("\n"));
		}
		if (/^(trait|type|const|static|fn|async|unsafe|mod)\b/.test(trimmed)) {
			lines[i] = `pub ${lines[i]}`;
			return lines.join("\n");
		}
		return text;
	}
	return text;
}

/** The opening line of a block item and the index of its closing brace. */
function blockBounds(lines: string[]): { open: number; close: number } | null {
	const open = lines.findIndex((line) => {
		const trimmed = line.trimEnd();
		return trimmed.endsWith("{") && !trimmed.startsWith("//");
	});
	if (open === -1) return null;
	let depth = 0;
	const lex: LexState = { inString: false, inRaw: null, inBlockComment: 0, inChar: false };
	for (let i = open; i < lines.length; i += 1) {
		for (const char of blankLiterals(lines[i], lex)) {
			if (char === "{") depth += 1;
			else if (char === "}") depth -= 1;
		}
		if (depth === 0) return { open, close: i };
	}
	return null;
}

/** Groups member items into bundles that fit the target, without cutting any member. */
function packMembers(members: Item[]): Item[][] {
	const groups: Item[][] = [];
	let current: Item[] = [];
	let lines = 0;
	for (const member of members) {
		if (current.length > 0 && lines + member.lines + 2 > TARGET) {
			groups.push(current);
			current = [];
			lines = 0;
		}
		current.push(member);
		lines += member.lines + 1;
	}
	if (current.length > 0) groups.push(current);
	return groups;
}

/**
 * Expands an oversized item into several items that are individually small enough.
 *
 * An `impl` block is split into several blocks for the same type — Rust allows that — and an inline
 * `mod tests { ... }` into numbered test modules. Anything else is left whole and reported.
 */
function expand(item: Item): Item[] {
	// Expand a little early: a part also carries the parent's import block.
	if (item.lines <= Math.min(LIMIT - 25, budget - 5)) return [item];
	const lines = item.text.split("\n");
	const codeIndex = firstCodeIndex(lines);
	const code = lines[codeIndex]?.trim() ?? "";
	const bounds = blockBounds(lines.slice(codeIndex));
	if (bounds === null) return [item];
	const headerLines = lines.slice(0, codeIndex + bounds.open + 1);
	const inner = lines.slice(codeIndex + bounds.open + 1, codeIndex + bounds.close);
	const members = splitItems(inner.join("\n"));
	if (members.length < 2) return [item];

	const prefix = headerLines.join("\n");
	const suffix = lines.slice(codeIndex + bounds.close).join("\n");

	if (code.startsWith("impl")) {
		let groups = packMembers(members);
		if (groups.length === 1 && item.lines > TARGET) {
			// One group still too big: halve the members so the blocks land in separate files.
			const half = Math.ceil(members.length / 2);
			groups = [members.slice(0, half), members.slice(half)];
		}
		return groups.map((group, index) => {
			const text = `${prefix}\n${group.map((m) => widen(m.text)).join("\n\n")}\n${suffix}`;
			return { name: `${item.name}_${index + 1}`, text, lines: lineCount(text) };
		});
	}
	if (/^(pub(\([^)]*\))?\s+)?mod\s+[A-Za-z_]/.test(code)) {
		// A test module splits into sibling modules at the same depth, and each one carries its own
		// copy of the helpers, so `super::` keeps pointing where it did and no helper has to be
		// visible across modules that Rust keeps private.
		const attributes = headerLines.filter((line) => line.trim().startsWith("#["));
		const isTest = (item: Item) =>
			item.text
				.split("\n")
				.some((line) => line.trim().startsWith("#[") && line.trim().endsWith("test]"));
		const helpers = members.filter((m) => !isTest(m));
		const tests = members.filter(isTest);
		if (tests.length === 0) return [item];
		const helperLines = helpers.reduce((sum, m) => sum + m.lines + 1, 0);
		const groups: Item[][] = [];
		let group: Item[] = [];
		let lines = helperLines;
		for (const test of tests) {
			if (group.length > 0 && lines + test.lines + 2 > budget) {
				groups.push(group);
				group = [];
				lines = helperLines;
			}
			group.push(test);
			lines += test.lines + 1;
		}
		if (group.length > 0) groups.push(group);
		// Each chunk carries a copy of the helpers, so a chunk that does not use one must not warn.
		// The file is named after the module, so the inline module gets its own suffix: Rust rejects a
		// module that shares its parent's name.
		const header = `${attributes.join("\n")}\n#[allow(dead_code)]\nmod ${item.name}_group_`;
		return groups.map((members_, index) => {
			const body = [...helpers, ...members_].map((m) => widen(m.text)).join("\n\n");
			const text = `${header}${index + 1} {\n${body}\n}`;
			return { name: `${item.name}_${index + 1}`, text, lines: lineCount(text) };
		});
	}
	return [item];
}

/** Names that already mean something to the compiler; a module called `diagnostic` breaks macros. */
const RESERVED = new Set(["diagnostic", "rustc", "clippy", "miri", "test", "std", "core", "alloc"]);

function uniqueName(base: string, used: Set<string>): string {
	let name = RESERVED.has(base) ? `${base}_part` : base;
	let index = 2;
	while (used.has(name)) {
		name = `${base}_${index}`;
		index += 1;
	}
	used.add(name);
	return name;
}

export { parse, expand, splitItems };

const files = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const isMain = import.meta.main;
if (files.length === 0) {
	if (isMain) {
		console.error("usage: bun scripts/split-rust.ts <file.rs> [...] [--dry]");
		process.exit(1);
	}
}

let failures = 0;
for (const file of files) {
	const source = readFileSync(file, "utf8");
	const { header, items } = parse(source);
	if (items.length === 0) {
		console.error(`no top-level items found in ${file}`);
		failures += 1;
		continue;
	}

	const dir = join(dirname(file), basename(file, ".rs"));
	// Every part carries the parent's import block, so it eats into the line budget.
	const importLines = header.filter((line) => {
		const trimmed = line.trimStart();
		return !trimmed.startsWith("//!") && !trimmed.startsWith("#![");
	}).length;
	const target = TARGET - importLines;
	budget = target - 6;
	const expanded = items.flatMap(expand);

	// `#[tauri::command]` functions generate sibling constants that `lib.rs` names by path; they get
	// a module of their own and are re-exported, so the generated names keep resolving.

	const parts: { name: string; body: string[] }[] = [];

	const used = new Set<string>();
	let current: { name: string; body: string[]; lines: number } | null = null;

	for (const item of expanded) {
		if (item.lines > LIMIT) {
			console.error(`cannot split: ${item.name} alone is ${item.lines} lines in ${file}`);
			failures += 1;
		}
		if (process.argv.includes("--verbose"))
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
		if (!dry) writeFileSync(join(dir, `${part.name}.rs`), body);
		mod.push(`mod ${part.name};`, `pub use ${part.name}::*;`, "");
	}

	if (!dry) {
		writeFileSync(join(dir, "mod.rs"), `${mod.join("\n").trimEnd()}\n`);
		renameSync(file, `${file}.splitting`);
	}
	console.log(`${file}: ${items.length} items -> ${parts.length} parts`);
	if (process.argv.includes("--verbose")) {
		for (const part of parts) {
			const n = part.body.join("\n").split("\n").length;
			console.log(`  ${part.name}: ${n} lines, ${part.body.length} segments`);
		}
	}
}

if (failures > 0) process.exit(1);
