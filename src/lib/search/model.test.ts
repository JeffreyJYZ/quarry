import { describe, expect, test } from "bun:test";
import {
	applyReplacement,
	buildPreview,
	isPreviewStale,
	isStaleSearch,
	revealTarget,
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
	// `$&` used to be interpreted by String.replace rather than built from the match, so a preview
	// could show text the backend never wrote.
	test("$& expands to the whole match", () => {
		const opts = { caseSensitive: false, regex: true, wholeWord: false };
		expect(applyReplacement("foo bar", "(\\w+) (\\w+)", "$&!", opts)).toBe("foo bar!");
	});
	test("$0 expands to the whole match, like the backend", () => {
		const opts = { caseSensitive: false, regex: true, wholeWord: false };
		expect(applyReplacement("abc", "b", "[$0]", opts)).toBe("a[b]c");
	});
	test("$' is inserted literally, not as the text after the match", () => {
		const opts = { caseSensitive: false, regex: true, wholeWord: false };
		expect(applyReplacement("abc", "b", "$'", opts)).toBe("a$'c");
	});
	test("a literal $1 in a literal replacement stays literal", () => {
		const opts = { caseSensitive: false, regex: false, wholeWord: false };
		expect(applyReplacement("price 10", "10", "$1", opts)).toBe("price $1");
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

describe("revealTarget", () => {
	// The bug this pins: a click on a search hit opened the file at the top, because the position was
	// dropped on the way to the editor. The match is 1-based, the reveal target is 0-based.
	test("the first line and column of a file stay at zero", () => {
		expect(revealTarget(1, 1, "fn main() {}")).toEqual({ line: 0, character: 0 });
	});

	test("a match on line 12, column 5 reveals line 11, character 4", () => {
		expect(revealTarget(12, 5, "    let found = 1;")).toEqual({ line: 11, character: 4 });
	});

	test("a column past the first character is not clamped to the line start", () => {
		expect(
			revealTarget(3, 40, "0123456789012345678901234567890123456789012345").character,
		).toBe(39);
	});

	// The bug this pins: ripgrep's column is a byte offset, so subtracting one put a hit after a
	// multi-byte character several columns too far right.
	test("a match after a multi-byte character reveals at the right column", () => {
		// `é` is two bytes, so the match starts at byte column 8 but character 6.
		expect(revealTarget(4, 8, "héllo foo").character).toBe(6);
	});
});

describe("isStaleSearch", () => {
	test("a run whose ticket differs from the current sequence is stale", () => {
		expect(isStaleSearch(1, 2)).toBe(true);
	});
	test("a run whose ticket still matches is fresh", () => {
		expect(isStaleSearch(3, 3)).toBe(false);
	});
});
