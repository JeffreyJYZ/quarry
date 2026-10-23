/**
 * Splits a Rust source file into a module directory, cutting only between top-level items.
 *
 * `foo.rs` becomes `foo/mod.rs` plus `foo/<item>.rs` children. Every child starts with
 * `use super::*;`, so it sees the parent's imports and types; items are widened to `pub(crate)` so
 * siblings can reach them, and `mod.rs` re-exports each child with `pub use child::*;` so every
 * existing `crate::foo::X` path keeps working.
 *
 * Consecutive short items are packed together to keep the file count sane. An item that alone
 * exceeds the line limit is reported rather than cut.
 *
 * Usage: bun scripts/split-rust.ts src-tauri/src/foo.rs [--dry]
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const LIMIT = 200;
const PACK = 120;
const dry = process.argv.includes("--dry");

type Item = { name: string; text: string; lines: number };

const ITEM_START =
	/^(#\[|#!\[|\/\/\/|\/\/!|\/\/|pub\b|fn\b|struct\b|enum\b|union\b|impl\b|mod\b|trait\b|const\b|static\b|type\b|macro_rules!|extern\b|use\b)/;

function countDepth(line: string, depth: { round: number; curly: number; square: number }): void {
	for (const char of line) {
		if (char === "(") depth.round += 1;
		else if (char === ")") depth.round -= 1;
		else if (char === "{") depth.curly += 1;
		else if (char === "}") depth.curly -= 1;
		else if (char === "[") depth.square += 1;
		else if (char === "]") depth.square -= 1;
	}
}

function itemName(lines: string[], index: number): string {
	for (let i = index; i < Math.min(index + 12, lines.length); i += 1) {
		const line = lines[i];
		const match = line.match(
			/^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:fn|struct|enum|union|trait|type|const|static|mod)\s+([A-Za-z_][A-Za-z0-9_]*)/,
		);
		if (match) return match[1];
		const implMatch = line.match(
			/^impl(?:<[^>]*>)?\s+(?:[A-Za-z_][A-Za-z0-9_]*\s+for\s+)?([A-Za-z_][A-Za-z0-9_]*)/,
		);
		if (implMatch) return `impl_${implMatch[1]}`;
	}
	return "items";
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

	const items: Item[] = [];
	while (index < lines.length) {
		if (lines[index].trim() === "") {
			index += 1;
			continue;
		}
		const start = index;
		const name = itemName(lines, index);
		const depth = { round: 0, curly: 0, square: 0 };
		let sawBody = false;
		while (index < lines.length) {
			countDepth(lines[index], depth);
			if (lines[index].includes("{")) sawBody = true;
			const done =
				(sawBody && depth.curly === 0 && depth.round === 0) ||
				(!sawBody &&
					depth.round === 0 &&
					depth.square === 0 &&
					lines[index].trimEnd().endsWith(";"));
			index += 1;
			if (done) break;
		}
		const text = lines.slice(start, index).join("\n");
		const firstCode = text
			.split("\n")
			.find((line) => {
				const trimmed = line.trim();
				return (
					trimmed !== "" &&
					!trimmed.startsWith("#[") &&
					!trimmed.startsWith("///") &&
					!trimmed.startsWith("//")
				);
			})
			?.trim();
		// `use` items (with any `#[cfg]` attribute) are imports, so they stay in mod.rs.
		if (
			firstCode !== undefined &&
			(firstCode.startsWith("use ") || firstCode.startsWith("pub use "))
		) {
			const block = text.split("\n");
			const codeIndex = block.findIndex((line) => {
				const trimmed = line.trim();
				return trimmed.startsWith("use ") || trimmed.startsWith("pub use ");
			});
			const code = block[codeIndex].trimStart();
			if (!code.startsWith("pub ")) {
				// Re-exported so a sibling module sees the same names through `use super::*`.
				block[codeIndex] =
					`${code.startsWith("use crate::") ? "pub(crate) " : "pub "}${code}`;
			}
			header.push(...block);
			continue;
		}
		items.push({ name, text, lines: text.split("\n").length });
	}

	while (header.length > 0 && header[header.length - 1].trim() === "") header.pop();
	return { header, items };
}

/**
 * A `mod name { ... }` item that is too large becomes its own directory: the inner items are packed
 * exactly like a file, and the module's `mod.rs` re-exports them.
 */
function splitInlineModule(item: Item, parentDir: string, dryRun: boolean): boolean {
	const lines = item.text.split("\n");
	const openIndex = lines.findIndex((line) =>
		/^\s*(?:pub\([^)]*\)\s+)?mod\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/.test(line),
	);
	if (openIndex === -1) return false;
	const closeIndex =
		lines.length - 1 - [...lines].reverse().findIndex((line) => line.trim() === "}");
	if (closeIndex <= openIndex) return false;
	const inner = lines.slice(openIndex + 1, closeIndex).join("\n");
	const { items } = parse(inner);
	if (items.length === 0) return false;

	const dir = join(parentDir, item.name);
	mkdirSync(dir, { recursive: true });
	const parts: { name: string; body: string[] }[] = [];
	let current: { name: string; body: string[]; lines: number } | null = null;
	const used = new Set<string>();
	for (const child of items) {
		const fits = current !== null && current.lines + child.lines + 2 <= PACK;
		if (!fits) {
			let name = child.name.toLowerCase();
			let suffix = 2;
			while (used.has(name)) {
				name = `${child.name.toLowerCase()}_${suffix}`;
				suffix += 1;
			}
			used.add(name);
			current = { name, body: [], lines: 0 };
			parts.push({ name, body: current.body });
		}
		if (current === null) continue;
		current.body.push(widen(child.text), "");
		current.lines += child.lines + 1;
	}

	const mod: string[] = [];
	for (const part of parts) {
		const body = `#![allow(unused_imports)]\n\nuse super::*;\n\n${part.body.join("\n").trimEnd()}\n`;
		if (!dryRun) writeFileSync(join(dir, `${part.name}.rs`), body);
		mod.push(`mod ${part.name};`, `pub use ${part.name}::*;`, "");
	}
	if (!dryRun) writeFileSync(join(dir, "mod.rs"), `${mod.join("\n").trimEnd()}\n`);
	return true;
}

/** Widens a top-level item, and a struct's fields, so a sibling module can use them. */
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

/** Widens a top-level item to `pub(crate)` when it is private, so sibling modules can use it. */
function widen(text: string): string {
	const lines = text.split("\n");
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		const trimmed = line.trim();
		if (
			trimmed === "" ||
			trimmed.startsWith("#[") ||
			trimmed.startsWith("///") ||
			trimmed.startsWith("//")
		)
			continue;
		if (/^(struct|enum|union|trait|type|const|static|fn|async fn|mod)\b/.test(trimmed)) {
			lines[i] = `pub ${line}`;
			const joined = lines.join("\n");
			return trimmed.startsWith("struct") ? widenFields(joined) : joined;
		}
		if (/^pub(\([^)]*\))?\s+(struct|enum|union)\b/.test(trimmed)) return widenFields(text);
		if (/^pub(\([^)]*\))?\s/.test(trimmed)) return text;
		if (
			trimmed.startsWith("impl") ||
			trimmed.startsWith("use") ||
			trimmed.startsWith("macro_rules!")
		)
			return text;
		return text;
	}
	return text;
}

const files = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (files.length === 0) {
	console.error("usage: bun scripts/split-rust.ts <file.rs> [...] [--dry]");
	process.exit(1);
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

	const parts: { name: string; body: string[] }[] = [];
	const used = new Set<string>();
	const uniqueName = (base: string) => {
		let name = base;
		let index = 2;
		while (used.has(name)) {
			name = `${base}_${index}`;
			index += 1;
		}
		used.add(name);
		return name;
	};
	let current: { name: string; body: string[]; lines: number } | null = null;

	const inlineModules: string[] = [];
	for (const item of items) {
		if (item.lines > LIMIT) {
			// A big inline module (usually `mod tests`) can still be split inside.
			if (splitInlineModule(item, join(dirname(file), basename(file, ".rs")), dry)) {
				inlineModules.push(item.name);
				continue;
			}
			console.error(`cannot split: ${item.name} alone is ${item.lines} lines in ${file}`);
			failures += 1;
		}
		const fits = current !== null && current.lines + item.lines + 2 <= PACK;
		if (!fits) {
			current = { name: uniqueName(item.name.toLowerCase()), body: [], lines: 0 };
			parts.push({ name: current.name, body: current.body });
		}
		if (current === null) continue;
		current.body.push(widen(item.text), "");
		current.lines += item.lines + 1;
	}

	// A part that ends mid-attribute is merged into the next one, and a dangling doc comment moves
	// with the item it documents.
	for (let i = 0; i < parts.length - 1; i += 1) {
		const body = parts[i].body;
		while (body.length > 0 && body[body.length - 1].trim() === "") body.pop();
		const last = body[body.length - 1]?.trimStart() ?? "";
		if (last.startsWith("#[")) {
			const merged = [...body, "", ...parts[i + 1].body];
			parts[i].body.length = 0;
			parts[i + 1].body.length = 0;
			parts[i + 1].body.push(...merged);
			parts.splice(i, 1);
			i -= 1;
			continue;
		}
		const move: string[] = [];
		while (body.length > 0 && (body[body.length - 1] ?? "").trimStart().startsWith("///")) {
			const line = body.pop();
			if (line !== undefined) move.unshift(line);
		}
		if (move.length > 0) parts[i + 1].body.unshift(...move, "");
	}

	const dir = join(dirname(file), basename(file, ".rs"));
	mkdirSync(dir, { recursive: true });
	const mod: string[] = [...header, ""];

	// Every part needs the parent's imports; multi-line `use` blocks must be copied whole.
	const imports = header
		.filter((line) => {
			const trimmed = line.trimStart();
			return !trimmed.startsWith("//!") && !trimmed.startsWith("#![");
		})
		.join("\n");
	for (const name of inlineModules) mod.push(`mod ${name};`, "");
	for (const part of parts) {
		const body = `#![allow(unused_imports)]\n\n${imports}\n\nuse super::*;\n\n${part.body.join("\n").trimEnd()}\n`;
		if (!dry) writeFileSync(join(dir, `${part.name}.rs`), body);
		mod.push(`mod ${part.name};`, `pub use ${part.name}::*;`, "");
	}

	if (!dry) {
		writeFileSync(join(dir, "mod.rs"), `${mod.join("\n").trimEnd()}\n`);
		renameSync(file, `${file}.splitting`);
	}
	console.log(
		`${file}: ${items.length} items -> ${parts.length} parts (${parts.map((p) => p.name).join(", ")})`,
	);
}

if (failures > 0) process.exit(1);
