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

	test("an escaped quote inside quotes is a literal quote", () => {
		expect(splitArgs('"a\\"b"')).toEqual(['a"b']);
	});

	test("an escaped backslash inside quotes is a literal backslash", () => {
		expect(splitArgs('"a\\\\b"')).toEqual(["a\\b"]);
	});

	test("quotes and spaces survive together through escapes", () => {
		expect(splitArgs('"say \\"hi\\"" next')).toEqual(['say "hi"', "next"]);
	});

	test("a backslash inside quotes not before a quote or backslash stays literal", () => {
		expect(splitArgs('"C:\\temp"')).toEqual(["C:\\temp"]);
	});

	test("a backslash outside quotes stays literal", () => {
		expect(splitArgs("C:\\temp\\bin")).toEqual(["C:\\temp\\bin"]);
	});

	test("empty input yields empty array", () => {
		expect(splitArgs("")).toEqual([]);
	});
});
