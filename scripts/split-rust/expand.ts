/**
 * Making an oversized item small enough to live in one part.
 *
 * An `impl` block becomes several `impl` blocks for the same type — Rust allows that — and an inline
 * `mod tests { ... }` becomes several numbered test modules. A single function that large is reported
 * instead of being cut, because cutting it would change the program.
 */

import { LIMIT, TARGET } from "./consts";
import { type Item, splitItems } from "./items";
import { blankLiterals, type LexState } from "./lexer";
import { widen } from "./widen";

/** Room a single expanded item may take, once the import block and wrapper are accounted for. */
let budget = TARGET;

/** Per file, the parent's import block eats into the budget the parts have left. */
export function setBudget(value: number): void {
	budget = value;
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

function lineCount(text: string): number {
	return text.split("\n").length;
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

export function expand(item: Item): Item[] {
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
