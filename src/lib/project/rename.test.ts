import { describe, expect, test } from "bun:test";
import type { FileBuffer } from "@/lib/project/buffer";
import { remapBuffers, remapPath } from "@/lib/project/rename";

function buffer(path: string): FileBuffer {
	return { path, name: path.slice(path.lastIndexOf("/") + 1), text: "", loaded: "" };
}

describe("remapPath", () => {
	test("moves a file directly under a renamed folder", () => {
		expect(remapPath("/p/src/util/a.rs", "/p/src/util", "/p/src/tools")).toBe(
			"/p/src/tools/a.rs",
		);
	});

	test("moves a file nested deeper in the renamed folder", () => {
		expect(remapPath("/p/src/util/inner/a.rs", "/p/src/util", "/p/src/tools")).toBe(
			"/p/src/tools/inner/a.rs",
		);
	});

	test("leaves a sibling whose name shares the prefix alone", () => {
		expect(remapPath("/p/src/util2/a.rs", "/p/src/util", "/p/src/tools")).toBe(
			"/p/src/util2/a.rs",
		);
	});

	test("handles a single-file rename", () => {
		expect(remapPath("/p/src/a.rs", "/p/src/a.rs", "/p/src/b.rs")).toBe("/p/src/b.rs");
	});

	test("keeps backslash separators", () => {
		expect(remapPath("C:\\p\\src\\util\\a.rs", "C:\\p\\src\\util", "C:\\p\\src\\tools")).toBe(
			"C:\\p\\src\\tools\\a.rs",
		);
	});
});

describe("remapBuffers", () => {
	test("moves every buffer under a renamed folder and leaves a prefix sibling alone", () => {
		const buffers = [
			buffer("/p/src/util/a.rs"),
			buffer("/p/src/util/inner/b.rs"),
			buffer("/p/src/util2/c.rs"),
			buffer("/p/src/main.rs"),
		];
		const moved = remapBuffers(buffers, "/p/src/util", "/p/src/tools");
		expect(moved.map((entry) => entry.path)).toEqual([
			"/p/src/tools/a.rs",
			"/p/src/tools/inner/b.rs",
			"/p/src/util2/c.rs",
			"/p/src/main.rs",
		]);
		expect(moved[1]?.name).toBe("b.rs");
	});
});
