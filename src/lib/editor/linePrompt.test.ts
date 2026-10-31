import { describe, expect, test } from "bun:test";
import { parseLine } from "@/lib/editor/linePrompt";

describe("parseLine", () => {
	test("reads a plain number", () => {
		expect(parseLine("12", 100)).toBe(12);
	});

	test("clamps past the end to the last line", () => {
		expect(parseLine("9999", 40)).toBe(40);
	});

	test("a zero or negative means the first line", () => {
		expect(parseLine("0", 40)).toBe(1);
	});

	test("ignores anything that is not a number", () => {
		expect(parseLine("twelve", 40)).toBeNull();
		expect(parseLine("12a", 40)).toBeNull();
		expect(parseLine("", 40)).toBeNull();
	});

	test("works on an empty buffer", () => {
		expect(parseLine("7", 0)).toBe(1);
	});
});
