import { describe, expect, test } from "bun:test";
import { stepValue } from "@/lib/settings/step";

describe("stepValue", () => {
	test("steps up and down inside the caller's range", () => {
		expect(stepValue(13, 1, 9, 24, 13)).toBe(14);
		expect(stepValue(13, -1, 9, 24, 13)).toBe(12);
	});

	// The stepper used to clamp through the editor's 9..24 range, so a control with a tighter
	// range (the terminal is 9..20) stepped past its own limit and only the store clamped it back.
	test("the caller's range bounds the step, not the font range", () => {
		expect(stepValue(19, 1, 9, 20, 13)).toBe(20);
		expect(stepValue(10, -1, 14, 20, 13)).toBe(14);
		expect(stepValue(30, -1, 9, 20, 13)).toBe(20);
	});

	test("a value already at the limit does not move", () => {
		expect(stepValue(9, -1, 9, 24, 13)).toBe(9);
		expect(stepValue(24, 1, 9, 24, 13)).toBe(24);
	});

	test("a non-number falls back to the stored value instead of stepping", () => {
		expect(stepValue(Number.NaN, 1, 9, 24, 13)).toBe(13);
		expect(stepValue("15", 1, 9, 24, 13)).toBe(13);
		expect(stepValue(Number.POSITIVE_INFINITY, -1, 9, 24, 13)).toBe(13);
	});

	test("rounds a fractional value", () => {
		expect(stepValue(13.4, 0, 9, 24, 13)).toBe(13);
	});
});
