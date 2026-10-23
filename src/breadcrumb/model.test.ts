import { describe, expect, test } from "bun:test";
import { qualifiedName } from "./model";

describe("qualifiedName", () => {
	test("joins with ::", () => {
		expect(qualifiedName(["a", "b", "c"])).toBe("a::b::c");
	});
	test("single", () => {
		expect(qualifiedName(["x"])).toBe("x");
	});
});
