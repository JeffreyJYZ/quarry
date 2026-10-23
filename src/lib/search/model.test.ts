import { describe, expect, test } from "bun:test";
import {
	applyReplacement,
	buildPreview,
	isPreviewStale,
	searchFlags,
	transformQuery,
} from "@/lib/search/model";

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

describe("applyReplacement", () => {
	test("regex capture groups", () => {
		const opts = { caseSensitive: false, regex: true, wholeWord: false };
		expect(applyReplacement("foo bar", "foo (\\w+)", "$1 baz", opts)).toBe("bar baz");
	});
	test("named capture groups", () => {
		const opts = { caseSensitive: false, regex: true, wholeWord: false };
		// biome-ignore lint/suspicious/noTemplateCurlyInString: the literal reference is the input under test
		expect(applyReplacement("hello world", "(?<name>\\w+) (\\w+)", "${name}-$2", opts)).toBe(
			"hello-world",
		);
	});
	test("literal insertion when regex off", () => {
		const opts = { caseSensitive: false, regex: false, wholeWord: false };
		expect(applyReplacement("a $1 b", "$1", "X", opts)).toBe("a X b");
	});
	test("case sensitive applies", () => {
		const opts = { caseSensitive: true, regex: false, wholeWord: false };
		expect(applyReplacement("Foo foo", "foo", "BAR", opts)).toBe("Foo BAR");
	});
});

describe("buildPreview", () => {
	test("returns lines", () => {
		const r = buildPreview([{ path: "a.rs", line: 1, text: "x y" }], "x", "z", {
			caseSensitive: false,
			regex: false,
			wholeWord: false,
		});
		expect(r.lines.length).toBe(1);
		expect(r.lines[0].newText).toBe("z y");
		expect(r.truncated).toBe(false);
	});
});

describe("isPreviewStale", () => {
	test("stale when query changed", () => {
		expect(isPreviewStale({ query: "a", replacement: "b" }, "c", "b")).toBe(true);
	});
	test("stale when replacement changed", () => {
		expect(isPreviewStale({ query: "a", replacement: "b" }, "a", "c")).toBe(true);
	});
	test("not stale when same", () => {
		expect(isPreviewStale({ query: "a", replacement: "b" }, "a", "b")).toBe(false);
	});
	test("stale when no snapshot", () => {
		expect(isPreviewStale(null, "a", "b")).toBe(true);
	});
});
