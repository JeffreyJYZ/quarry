import { describe, expect, test } from "bun:test";
import { normalizeLines } from "@/lib/editor/breakpoints";

describe("normalizeLines", () => {
	test("undefined returns empty", () => {
		expect(normalizeLines(undefined)).toEqual([]);
	});
	test("empty returns empty", () => {
		expect(normalizeLines([])).toEqual([]);
	});
	test("dedups and sorts", () => {
		expect(normalizeLines([3, 1, 2, 1])).toEqual([1, 2, 3]);
	});
	test("drops non-positive and non-integers", () => {
		expect(normalizeLines([0, -1, 1.5, 2])).toEqual([2]);
	});
	test("keeps positive integers", () => {
		expect(normalizeLines([5])).toEqual([5]);
	});
});
