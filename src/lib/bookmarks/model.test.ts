import { describe, expect, test } from "bun:test";
import { bookmarkLines, groupBookmarks, type Bookmark } from "@/lib/bookmarks/model";

const rows: Bookmark[] = [
	{ path: "/p/src/b.rs", line: 7, text: "second" },
	{ path: "/p/src/a.rs", line: 9, text: "first" },
	{ path: "/p/src/b.rs", line: 3, text: "first" },
];

describe("bookmarks grouped by file", () => {
	test("one group per file, ordered by its relative label", () => {
		const groups = groupBookmarks(rows, "/p");
		expect(groups.map((group) => group.label)).toEqual(["src/a.rs", "src/b.rs"]);
	});

	test("rows inside a group are ordered by line", () => {
		const groups = groupBookmarks(rows, "/p");
		expect(groups[1].rows.map((row) => row.line)).toEqual([3, 7]);
	});

	test("the label falls back to the file name without a root", () => {
		const groups = groupBookmarks(rows, null);
		expect(groups.map((group) => group.label)).toEqual(["a.rs", "b.rs"]);
	});

	test("an empty list is no groups", () => {
		expect(groupBookmarks([], "/p")).toEqual([]);
	});
});

describe("the lines a file's gutter paints", () => {
	test("only the active file's lines, ascending and unique", () => {
		const duplicated: Bookmark[] = [
			...rows,
			{ path: "/p/src/b.rs", line: 3, text: "again" },
			{ path: "/p/src/b.rs", line: 1, text: "top" },
		];
		expect(bookmarkLines(duplicated, "/p/src/b.rs")).toEqual([1, 3, 7]);
	});

	test("another file's bookmarks are never painted", () => {
		expect(bookmarkLines(rows, "/p/src/a.rs")).toEqual([9]);
	});

	test("no active file paints nothing", () => {
		expect(bookmarkLines(rows, null)).toEqual([]);
	});
});
