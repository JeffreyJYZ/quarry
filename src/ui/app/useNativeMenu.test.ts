import { describe, expect, test } from "bun:test";
import { isMenuCommand } from "./useNativeMenu";

describe("isMenuCommand", () => {
	test("known id", () => {
		expect(isMenuCommand("save")).toBe(true);
	});
	test("unknown id", () => {
		expect(isMenuCommand("nope")).toBe(false);
	});
});
