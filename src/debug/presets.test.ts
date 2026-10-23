import { describe, expect, test } from "bun:test";
import { joinArgs, splitArgs, validateLaunchFile, validatePresets } from "./presets";

describe("splitArgs", () => {
	test("splits on whitespace", () => {
		expect(splitArgs("a b  c")).toEqual(["a", "b", "c"]);
	});
	test("empty", () => {
		expect(splitArgs("")).toEqual([]);
		expect(splitArgs("   ")).toEqual([]);
	});
});

describe("joinArgs", () => {
	test("joins", () => {
		expect(joinArgs(["a", "b", "c"])).toBe("a b c");
	});
	test("round trip", () => {
		expect(splitArgs(joinArgs(["x", "y"]))).toEqual(["x", "y"]);
	});
});

describe("validatePresets", () => {
	test("empty name", () => {
		expect(validatePresets([""])).not.toBeNull();
	});
	test("duplicate", () => {
		expect(validatePresets(["a", "a"])).not.toBeNull();
	});
	test("ok", () => {
		expect(validatePresets(["a", "b"])).toBeNull();
	});
});

describe("validateLaunchFile", () => {
	test("unknown field", () => {
		expect(
			validateLaunchFile({ configurations: [{ name: "x", foo: 1 }] } as {
				configurations: Array<Record<string, unknown>>;
			}),
		).not.toBeNull();
	});
	test("ok", () => {
		expect(
			validateLaunchFile({
				configurations: [
					{
						name: "x",
						program: "p",
						args: [],
						cwd: null,
						build: null,
						stopOnEntry: false,
						initCommands: [],
					},
				],
			}),
		).toBeNull();
	});
});
