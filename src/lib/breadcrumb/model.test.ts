import { describe, expect, test } from "bun:test";
import type { DocumentSymbol as LspSymbol } from "@/lib/project/api";
import { containingSymbols, qualifiedName, sortedByRange } from "@/lib/breadcrumb/model";

function sym(name: string, depth: number, startLine: number, endLine: number): LspSymbol {
	return {
		name,
		kind: 12,
		range: { start: { line: startLine, character: 0 }, end: { line: endLine, character: 1 } },
		depth,
	};
}

describe("qualifiedName", () => {
	test("joins with ::", () => {
		expect(qualifiedName(["a", "b", "c"])).toBe("a::b::c");
	});
	test("single", () => {
		expect(qualifiedName(["x"])).toBe("x");
	});
});

describe("sortedByRange", () => {
	test("puts the outermost symbol first without touching its input", () => {
		const inner = sym("inner", 1, 2, 3);
		const outer = sym("outer", 0, 0, 10);
		const input = [inner, outer];

		expect(sortedByRange(input).map((symbol) => symbol.name)).toEqual(["outer", "inner"]);
		expect(input.map((symbol) => symbol.name)).toEqual(["inner", "outer"]);
	});
});

describe("containingSymbols", () => {
	const inner = sym("inner", 1, 2, 3);
	const outer = sym("outer", 0, 0, 10);
	const ordered = [outer, inner];

	test("keeps the order it is given", () => {
		expect(containingSymbols(ordered, { line: 2, character: 0 })).toEqual([outer, inner]);
	});

	test("drops a symbol the cursor left, and all of them for no cursor", () => {
		expect(containingSymbols(ordered, { line: 5, character: 0 })).toEqual([outer]);
		expect(containingSymbols(ordered, null)).toEqual([]);
	});
});
