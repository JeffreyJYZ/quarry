import { describe, expect, test } from "bun:test";
import {
	clampFontSize,
	decreaseFontSize,
	increaseFontSize,
	parseOsc7Cwd,
	resetFontSize,
	scrollbackText,
} from "@/lib/terminal/fontSize";

describe("clampFontSize", () => {
	test("clamps below min", () => expect(clampFontSize(5)).toBe(9));
	test("clamps above max", () => expect(clampFontSize(99)).toBe(20));
	test("keeps in range", () => expect(clampFontSize(12)).toBe(12));
	test("non-finite falls back to default", () => expect(clampFontSize(NaN)).toBe(11.5));
});

describe("step", () => {
	test("increase", () => expect(increaseFontSize(11.5)).toBe(12.5));
	test("decrease", () => expect(decreaseFontSize(11.5)).toBe(10.5));
	test("increase clamps at max", () => expect(increaseFontSize(20)).toBe(20));
	test("decrease clamps at min", () => expect(decreaseFontSize(9)).toBe(9));
});

describe("reset", () => {
	test("returns default", () => expect(resetFontSize()).toBe(11.5));
});

describe("scrollbackText", () => {
	test("joins lines", () => expect(scrollbackText(["a", "b"])).toBe("a\nb"));
});

describe("parseOsc7Cwd", () => {
	test("parses bel terminator", () => {
		expect(parseOsc7Cwd("\x1b]7;file://host/Users/foo/bar\x07")).toBe("/Users/foo/bar");
	});
	test("parses st terminator", () => {
		expect(parseOsc7Cwd("\x1b]7;file://host/tmp\x1b\\")).toBe("/tmp");
	});
	test("returns null when absent", () => {
		expect(parseOsc7Cwd("hello")).toBeNull();
	});
	test("decodes percent escapes", () => {
		expect(parseOsc7Cwd("\x1b]7;file://host/a%20b\x07")).toBe("/a b");
	});
});
