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
	test("windows separators are a path, not a reason to bail out", () => {
		expect(isInside("C:\\proj", "C:\\proj\\src\\main.cpp")).toBe(true);
		expect(isInside("C:/proj", "C:/proj/src/main.cpp")).toBe(true);
		expect(isInside("C:\\proj", "C:/proj/src/main.cpp")).toBe(true);
		expect(isInside("C:\\proj", "C:\\proj-2\\src\\main.cpp")).toBe(false);
	});
	test("the root itself is not inside", () => {
		expect(isInside("/root", "/root")).toBe(false);
		expect(isInside("C:\\proj", "C:\\proj")).toBe(false);
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
	test("windows ancestors keep the root's own separator", () => {
		expect(ancestorDirs("C:\\proj", "C:\\proj\\a\\b\\c.ts")).toEqual([
			"C:\\proj\\a",
			"C:\\proj\\a\\b",
		]);
	});
	test("mixed separators still name every ancestor", () => {
		expect(ancestorDirs("C:\\proj", "C:/proj/a/b.ts")).toEqual(["C:\\proj\\a"]);
	});
});
