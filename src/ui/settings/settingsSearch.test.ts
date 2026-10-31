import { describe, expect, test } from "bun:test";
import { rowMatches } from "./settingsSearch";

describe("rowMatches", () => {
	test("case-insensitive hit", () => {
		expect(rowMatches("Font Size", "font")).toBe(true);
	});
	test("miss", () => {
		expect(rowMatches("Font Size", "color")).toBe(false);
	});
	test("blank query true", () => {
		expect(rowMatches("Font Size", "")).toBe(true);
	});
	test("whitespace-only query true", () => {
		expect(rowMatches("Font Size", "   ")).toBe(true);
	});
});
