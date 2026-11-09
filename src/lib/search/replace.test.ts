import { describe, expect, test } from "bun:test";
import { replacementChanges } from "@/lib/search/replace";

/** `replaceAll` over a string, the way the editor applies one transaction. */
function replaced(text: string, query: string, replacement: string, regex: boolean): string {
	let out = text;
	for (const change of [
		...replacementChanges(text, query, replacement, {
			caseSensitive: false,
			regex,
			wholeWord: false,
		}),
	].reverse()) {
		out = `${out.slice(0, change.from)}${change.insert}${out.slice(change.to)}`;
	}
	return out;
}

describe("replacementChanges", () => {
	// The bug this pins: the editor inserted the literal replacement for every match, so a regex
	// query never expanded its capture groups.
	test("a regex query expands $1 for every match", () => {
		expect(replaced("foo bar foo baz", "foo (\\w+)", "$1 done", true)).toBe(
			"bar done baz done",
		);
	});

	test("$& expands to the whole match", () => {
		expect(replaced("abc", "b", "[$&]", true)).toBe("a[b]c");
	});

	test("a literal query inserts the replacement verbatim", () => {
		expect(replaced("price 10", "10", "$1", false)).toBe("price $1");
	});
});
