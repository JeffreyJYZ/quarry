import { describe, expect, test } from "bun:test";
import { ancestorDirs, isInside } from "./revealTarget";

describe("isInside", () => {
	test("nested file inside root", () => {
		expect(isInside("/root", "/root/a/b.ts")).toBe(true);
	});
	test("root-level file", () => {
		expect(isInside("/root", "/root/file.ts")).toBe(true);
	});
	test("outside root", () => {
		expect(isInside("/root", "/other/file.ts")).toBe(false);
	});
	test("null target", () => {
		expect(isInside("/root", null)).toBe(false);
	});
	test("trailing slash on root", () => {
		expect(isInside("/root/", "/root/file.ts")).toBe(true);
	});
	test("backslashes rejected", () => {
		expect(isInside("/root", "C:\\root\\file.ts")).toBe(false);
		expect(isInside("/root", "/root/a\\b.ts")).toBe(false);
	});
});

describe("ancestorDirs", () => {
	test("nested file", () => {
		expect(ancestorDirs("/root", "/root/a/b/c.ts")).toEqual(["/root/a", "/root/a/b"]);
	});
	test("root-level file", () => {
		expect(ancestorDirs("/root", "/root/file.ts")).toEqual([]);
	});
	test("outside root", () => {
		expect(ancestorDirs("/root", "/other/file.ts")).toEqual([]);
	});
	test("trailing slash on root", () => {
		expect(ancestorDirs("/root/", "/root/a/b.ts")).toEqual(["/root/a"]);
	});
	test("backslashes rejected", () => {
		expect(ancestorDirs("/root", "/root/a\\b.ts")).toEqual([]);
	});
});
