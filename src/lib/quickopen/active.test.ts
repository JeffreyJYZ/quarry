import { describe, expect, test } from "bun:test";
import { clampActive } from "@/lib/quickopen/active";

describe("clampActive", () => {
	test("leaves a row inside the list alone", () => {
		expect(clampActive(1, 3)).toBe(1);
	});

	test("clamps to the last row when the list shrinks", () => {
		expect(clampActive(5, 3)).toBe(2);
	});

	test("an empty list selects index 0", () => {
		expect(clampActive(2, 0)).toBe(0);
	});

	test("a negative row becomes the first", () => {
		expect(clampActive(-1, 3)).toBe(0);
	});
});
