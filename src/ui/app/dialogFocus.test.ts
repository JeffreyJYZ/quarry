import { describe, expect, test } from "bun:test";
import { dialogTabTarget } from "./dialogFocus";

describe("dialogTabTarget", () => {
	test("forward from the last stop wraps to the first", () => {
		expect(dialogTabTarget(3, 2, false)).toBe(0);
	});

	test("backward from the first stop wraps to the last", () => {
		expect(dialogTabTarget(3, 0, true)).toBe(2);
	});

	test("a move between the ends is the browser's to make", () => {
		expect(dialogTabTarget(3, 1, false)).toBeNull();
		expect(dialogTabTarget(3, 1, true)).toBeNull();
		expect(dialogTabTarget(3, 0, false)).toBeNull();
		expect(dialogTabTarget(3, 2, true)).toBeNull();
	});

	test("focus on the panel itself enters the loop at its near end", () => {
		expect(dialogTabTarget(3, -1, false)).toBe(0);
		expect(dialogTabTarget(3, -1, true)).toBe(2);
	});

	test("a dialog with one stop wraps onto itself", () => {
		expect(dialogTabTarget(1, 0, false)).toBe(0);
		expect(dialogTabTarget(1, 0, true)).toBe(0);
	});

	test("a dialog with nothing focusable traps nothing", () => {
		expect(dialogTabTarget(0, -1, false)).toBeNull();
		expect(dialogTabTarget(0, -1, true)).toBeNull();
	});
});
