import { describe, expect, test } from "bun:test";
import type { Bookmark } from "@/lib/bookmarks/model";
import { selectBookmark } from "@/lib/bookmarks/navigate";

function bookmark(path: string, line: number): Bookmark {
	return { path, line, text: "" };
}

/** The dock's order: by file, then by line. */
const rows: Bookmark[] = [
	bookmark("/p/a.rs", 2),
	bookmark("/p/a.rs", 9),
	bookmark("/p/b.rs", 4),
	bookmark("/p/c.rs", 1),
	bookmark("/p/c.rs", 7),
];

describe("stepping through bookmarks", () => {
	test("next stays in the file while a later line is marked", () => {
		expect(selectBookmark(rows, { path: "/p/a.rs", line: 2 }, 1)).toEqual(rows[1] ?? null);
	});

	test("next leaves for the first bookmark of a later file", () => {
		expect(selectBookmark(rows, { path: "/p/a.rs", line: 9 }, 1)).toEqual(rows[2] ?? null);
	});

	test("previous leaves for the last bookmark of an earlier file", () => {
		expect(selectBookmark(rows, { path: "/p/b.rs", line: 4 }, -1)).toEqual(rows[1] ?? null);
	});

	test("next wraps from the last bookmark to the first", () => {
		expect(selectBookmark(rows, { path: "/p/c.rs", line: 7 }, 1)).toEqual(rows[0] ?? null);
	});

	test("previous wraps from the first bookmark to the last", () => {
		expect(selectBookmark(rows, { path: "/p/a.rs", line: 2 }, -1)).toEqual(rows[4] ?? null);
	});

	test("a file without a bookmark picks the first one after it, and the last one before it", () => {
		const between = { path: "/p/bb.rs", line: 40 };
		expect(selectBookmark(rows, between, 1)).toEqual(rows[3] ?? null);
		expect(selectBookmark(rows, between, -1)).toEqual(rows[2] ?? null);
	});

	test("a caret on a marked line steps off it instead of staying put", () => {
		expect(selectBookmark(rows, { path: "/p/a.rs", line: 2 }, 1)).not.toEqual(rows[0] ?? null);
		expect(selectBookmark(rows, { path: "/p/a.rs", line: 2 }, -1)).not.toEqual(rows[0] ?? null);
	});

	test("no file at all walks in from either end", () => {
		expect(selectBookmark(rows, { path: null, line: 1 }, 1)).toEqual(rows[0] ?? null);
		expect(selectBookmark(rows, { path: null, line: 1 }, -1)).toEqual(rows[4] ?? null);
	});

	test("an empty list has nowhere to go", () => {
		expect(selectBookmark([], { path: "/p/a.rs", line: 1 }, 1)).toBeNull();
		expect(selectBookmark([], { path: null, line: 1 }, -1)).toBeNull();
	});

	test("wrapping off stops at the ends", () => {
		expect(selectBookmark(rows, { path: "/p/c.rs", line: 7 }, 1, false)).toBeNull();
		expect(selectBookmark(rows, { path: "/p/a.rs", line: 2 }, -1, false)).toBeNull();
	});
});
