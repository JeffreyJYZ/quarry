import { describe, expect, test } from "bun:test";
import { splitArgs } from "@/lib/run/splitArgs";

describe("splitArgs", () => {
	test("splits on whitespace", () => {
		expect(splitArgs("a b c")).toEqual(["a", "b", "c"]);
	});

	test("quoted spaces stay in one argument", () => {
		expect(splitArgs('a "b c" d')).toEqual(["a", "b c", "d"]);
	});

	test("trailing whitespace does not produce an empty argument", () => {
		expect(splitArgs("a b   ")).toEqual(["a", "b"]);
	});

	test("leading whitespace does not produce an empty argument", () => {
		expect(splitArgs("   a b")).toEqual(["a", "b"]);
	});

	test("an explicitly quoted empty string yields one empty argument", () => {
		expect(splitArgs('""')).toEqual([""]);
	});

	test("quoted empty string among others", () => {
		expect(splitArgs('a "" b')).toEqual(["a", "", "b"]);
	});

	test("unbalanced quote: trailing content joined into one token", () => {
		// documents actual behaviour: quote toggles, never closes -> rest is one token
		expect(splitArgs('a "b c')).toEqual(["a", "b c"]);
	});

	test("empty input yields empty array", () => {
		expect(splitArgs("")).toEqual([]);
	});
});
