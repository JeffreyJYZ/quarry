import { describe, expect, test } from "bun:test";
import { findMatchingBracket, foldRangeForLine } from "@/lib/editor/folding";

describe("findMatchingBracket", () => {
	test("matches braces forward", () => {
		const text = "a { b } c";
		expect(findMatchingBracket(text, 2)).toBe(6);
	});
	test("matches braces backward", () => {
		const text = "a { b } c";
		expect(findMatchingBracket(text, 6)).toBe(2);
	});
	test("unmatched returns -1", () => {
		const text = "a { b c";
		expect(findMatchingBracket(text, 2)).toBe(-1);
	});
	test("non-bracket returns -1", () => {
		expect(findMatchingBracket("abc", 1)).toBe(-1);
	});
});

describe("foldRangeForLine", () => {
	test("folds a brace block", () => {
		const text = "fn main() {\n\tlet x = 1;\n}";
		const r = foldRangeForLine(text, 1);
		expect(r).not.toBeNull();
		expect(r?.from).toBeGreaterThan(0);
		expect(r?.to).toBeGreaterThan(r?.from ?? 0);
	});
	test("non-opening line returns null", () => {
		const text = "fn main() {\n\tlet x = 1;\n}";
		expect(foldRangeForLine(text, 2)).toBeNull();
	});
	test("invalid line returns null", () => {
		const text = "x";
		expect(foldRangeForLine(text, 0)).toBeNull();
		expect(foldRangeForLine(text, 5)).toBeNull();
	});
});
