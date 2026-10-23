import { describe, expect, test } from "bun:test";
import type { Symbol as LspSymbol } from "@/lib/project/api";
import { caretSymbolIndex, filterSymbolIndices } from "@/lib/outline/model";

function sym(name: string, depth: number, startLine: number, endLine: number): LspSymbol {
	return {
		name,
		kind: 12,
		range: { start: { line: startLine, character: 0 }, end: { line: endLine, character: 1 } },
		depth,
	};
}

describe("filterSymbolIndices", () => {
	test("empty filter returns all up to cap", () => {
		const syms = [sym("a", 0, 0, 1), sym("b", 1, 2, 3)];
		expect(filterSymbolIndices(syms, "")).toEqual([0, 1]);
	});
	test("retains parent chain", () => {
		const syms = [sym("outer", 0, 0, 10), sym("inner", 1, 2, 3), sym("other", 0, 11, 12)];
		expect(filterSymbolIndices(syms, "inner")).toEqual([0, 1]);
	});
	test("no match returns empty", () => {
		const syms = [sym("foo", 0, 0, 1)];
		expect(filterSymbolIndices(syms, "zzz")).toEqual([]);
	});
});

describe("caretSymbolIndex", () => {
	test("picks smallest containing", () => {
		const syms = [sym("outer", 0, 0, 10), sym("inner", 1, 2, 3)];
		expect(caretSymbolIndex(syms, { line: 2, character: 0 })).toBe(1);
	});
	test("null cursor -> -1", () => {
		expect(caretSymbolIndex([sym("a", 0, 0, 1)], null)).toBe(-1);
	});
});
