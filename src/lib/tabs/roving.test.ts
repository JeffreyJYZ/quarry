import { describe, expect, test } from "bun:test";
import { isTabActivation, rovingIndex } from "@/lib/tabs/roving";

describe("the tablist roving model", () => {
	test("arrows step one tab and wrap at both ends", () => {
		expect(rovingIndex("ArrowRight", 0, 3)).toBe(1);
		expect(rovingIndex("ArrowRight", 2, 3)).toBe(0);
		expect(rovingIndex("ArrowLeft", 0, 3)).toBe(2);
		expect(rovingIndex("ArrowLeft", 1, 3)).toBe(0);
	});

	test("Down and Up move like Right and Left", () => {
		expect(rovingIndex("ArrowDown", 0, 2)).toBe(1);
		expect(rovingIndex("ArrowUp", 1, 2)).toBe(0);
	});

	test("Home and End jump to the ends", () => {
		expect(rovingIndex("Home", 2, 4)).toBe(0);
		expect(rovingIndex("End", 0, 4)).toBe(3);
	});

	test("an out-of-range selection starts from the first tab", () => {
		expect(rovingIndex("ArrowRight", -1, 3)).toBe(1);
		expect(rovingIndex("Home", 9, 3)).toBe(0);
	});

	test("Enter and Space activate, and other keys are not navigation", () => {
		expect(isTabActivation("Enter")).toBe(true);
		expect(isTabActivation(" ")).toBe(true);
		expect(isTabActivation("Tab")).toBe(false);
		expect(rovingIndex("Enter", 0, 3)).toBeNull();
		expect(rovingIndex("a", 0, 3)).toBeNull();
	});

	test("an empty strip has nowhere to land", () => {
		expect(rovingIndex("ArrowRight", 0, 0)).toBeNull();
	});
});
