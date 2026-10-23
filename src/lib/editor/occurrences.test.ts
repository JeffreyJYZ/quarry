import { describe, expect, test } from "bun:test";

import { occurrenceStarts } from "@/lib/editor/occurrences";

describe("occurrenceStarts", () => {
	test("finds all non-overlapping positions", () => {
		expect(occurrenceStarts("value a value b value", "value")).toEqual([0, 8, 16]);
	});

	test("returns empty for empty word", () => {
		expect(occurrenceStarts("abc", "")).toEqual([]);
	});

	test("returns empty when no match", () => {
		expect(occurrenceStarts("abc", "xyz")).toEqual([]);
	});

	test("handles single occurrence", () => {
		expect(occurrenceStarts("hello value world", "value")).toEqual([6]);
	});
});
