import { describe, expect, test } from "bun:test";
import { isAbsoluteRunPath, runCwd } from "@/lib/run/cwd";

describe("runCwd", () => {
	test("an empty field runs in the project root", () => {
		expect(runCwd("", "/work/demo")).toBe("/work/demo");
	});

	test("a whitespace-only field runs in the project root", () => {
		expect(runCwd("   ", "/work/demo")).toBe("/work/demo");
	});

	test("an absolute directory is kept", () => {
		expect(runCwd("/work/demo/build", "/work/demo")).toBe("/work/demo/build");
	});

	test("a relative directory is kept, so the caller can refuse it by name", () => {
		expect(runCwd("build", "/work/demo")).toBe("build");
	});
});

describe("isAbsoluteRunPath", () => {
	test("a POSIX path is absolute", () => {
		expect(isAbsoluteRunPath("/work/demo")).toBe(true);
	});

	test("a Windows drive path is absolute with either separator", () => {
		expect(isAbsoluteRunPath("C:\\work\\demo")).toBe(true);
		expect(isAbsoluteRunPath("C:/work/demo")).toBe(true);
	});

	test("a relative path is not absolute", () => {
		expect(isAbsoluteRunPath("build")).toBe(false);
		expect(isAbsoluteRunPath("")).toBe(false);
	});
});
