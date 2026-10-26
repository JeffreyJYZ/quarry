import { describe, expect, test } from "bun:test";
import { countLines, LIMIT } from "./check-file-size";

describe("check-file-size", () => {
	test("201 lines is over limit", () => {
		const text = Array.from({ length: 201 }, () => "x").join("\n") + "\n";
		expect(countLines(text)).toBe(201);
		expect(countLines(text) > LIMIT).toBe(true);
	});
	test("200 lines is not over limit", () => {
		const text = Array.from({ length: 200 }, () => "x").join("\n") + "\n";
		expect(countLines(text)).toBe(200);
		expect(countLines(text) > LIMIT).toBe(false);
	});
});
