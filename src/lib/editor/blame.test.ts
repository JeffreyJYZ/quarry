import { describe, expect, test } from "bun:test";
import { blameLabel, blameTitle } from "@/lib/editor/blame";

describe("blameLabel", () => {
	test("formats short label", () => {
		expect(blameLabel("abc1234", "Ada")).toBe("abc1234 · Ada");
	});
});

describe("blameTitle", () => {
	test("formats full title", () => {
		expect(blameTitle("abc1234", "Ada", "fix thing")).toBe("abc1234 · Ada · fix thing");
	});
});
