import { describe, expect, test } from "bun:test";
import { searchFlags, transformQuery } from "./model";

describe("transformQuery", () => {
	test("passes raw through when not whole word", () => {
		expect(
			transformQuery("foo.bar", { caseSensitive: false, regex: true, wholeWord: false }),
		).toBe("foo.bar");
	});

	test("wraps for whole word", () => {
		expect(transformQuery("foo", { caseSensitive: false, regex: true, wholeWord: true })).toBe(
			"\\b(?:foo)\\b",
		);
	});
});

describe("searchFlags", () => {
	test("regex on => fixedStrings false", () => {
		expect(searchFlags({ caseSensitive: true, regex: true, wholeWord: false })).toEqual({
			caseSensitive: true,
			fixedStrings: false,
		});
	});

	test("regex off => fixedStrings true", () => {
		expect(searchFlags({ caseSensitive: false, regex: false, wholeWord: false })).toEqual({
			caseSensitive: false,
			fixedStrings: true,
		});
	});

	test("whole word forces fixedStrings false", () => {
		expect(searchFlags({ caseSensitive: false, regex: false, wholeWord: true })).toEqual({
			caseSensitive: false,
			fixedStrings: false,
		});
	});
});
