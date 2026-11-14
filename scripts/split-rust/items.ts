/**
 * Cutting a file into top-level items, and deciding which of them belong in `mod.rs` rather than in
 * a child module.
 *
 * Only boundaries between items are ever cut: an item is never split here, because a half statement
 * compiles to a different program.
 */

import { blankLiterals, type LexState } from "./lexer";

export type Item = { name: string; text: string; lines: number };
export type Depth = { round: number; curly: number; square: number };

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

export function splitItems(source: string): Item[] {
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

export function parse(source: string): { header: string[]; items: Item[] } {
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
