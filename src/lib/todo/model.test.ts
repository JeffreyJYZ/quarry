import { describe, expect, test } from "bun:test";
import type { SearchMatch } from "@/lib/project/api";
import {
	countTodos,
	filterTodoFiles,
	todoFiles,
	todoPathListed,
	todoTarget,
} from "@/lib/todo/model";

function match(path: string, line: number, text: string): SearchMatch {
	return { path, line, column: 1, text };
}

describe("grouping a scan by file", () => {
	test("groups rows by path, with a count per file", () => {
		const files = todoFiles([
			match("/p/src/main.rs", 4, "// TODO: wire the pump"),
			match("/p/src/main.rs", 9, "// FIXME: leak"),
			match("/p/src/lib.rs", 2, "// HACK around the borrow checker"),
		]);

		expect(files.map((file) => [file.name, file.rows.length])).toEqual([
			["lib.rs", 1],
			["main.rs", 2],
		]);
		expect(countTodos(files)).toBe(3);
	});

	test("orders files by path and rows by line, whatever the scan returned", () => {
		const files = todoFiles([
			match("/p/b.rs", 30, "// TODO: three"),
			match("/p/a.rs", 20, "// TODO: two"),
			match("/p/b.rs", 10, "// TODO: one"),
		]);

		expect(files.map((file) => file.path)).toEqual(["/p/a.rs", "/p/b.rs"]);
		expect(files[1].rows.map((row) => row.line)).toEqual([10, 30]);
	});

	test("keeps one row for a line that matched twice", () => {
		const files = todoFiles([
			match("/p/a.rs", 7, "// TODO: one, FIXME: two"),
			match("/p/a.rs", 7, "// TODO: one, FIXME: two"),
		]);

		expect(files[0].rows).toEqual([{ line: 7, text: "// TODO: one, FIXME: two" }]);
	});

	test("trims the indentation the row shows, and drops an empty line", () => {
		const files = todoFiles([
			match("/p/a.rs", 3, "    // TODO: x    "),
			match("/p/a.rs", 4, "  "),
		]);

		expect(files[0].rows).toEqual([{ line: 3, text: "// TODO: x" }]);
	});
});

describe("the filter", () => {
	const files = todoFiles([
		match("/p/src/main.rs", 4, "// TODO: wire the pump"),
		match("/p/src/main.rs", 9, "// FIXME: leak in the reader"),
		match("/p/src/lib.rs", 2, "// HACK around the borrow checker"),
	]);

	test("narrows by row text, case-insensitively", () => {
		const filtered = filterTodoFiles(files, "LEAK");
		expect(filtered.map((file) => file.name)).toEqual(["main.rs"]);
		expect(countTodos(filtered)).toBe(1);
	});

	test("narrows by file path too", () => {
		const filtered = filterTodoFiles(files, "lib.rs");
		expect(countTodos(filtered)).toBe(1);
		expect(filtered[0].path).toBe("/p/src/lib.rs");
	});

	test("a blank query keeps every row", () => {
		expect(countTodos(filterTodoFiles(files, "   "))).toBe(3);
	});

	test("a query that matches nothing leaves no group behind", () => {
		expect(filterTodoFiles(files, "nonexistent")).toEqual([]);
	});
});

describe("what a click navigates to", () => {
	test("the row's 1-based line becomes the editor's 0-based line", () => {
		expect(todoTarget({ line: 12, text: "// TODO: x" })).toEqual({ line: 11, character: 0 });
	});
});

describe("whether a save is worth a rescan", () => {
	const files = todoFiles([match("/p/a.rs", 1, "// TODO: x")]);

	test("a file already in the list is listed", () => {
		expect(todoPathListed(files, "/p/a.rs")).toBe(true);
	});

	test("a file the list does not name is not", () => {
		expect(todoPathListed(files, "/p/b.rs")).toBe(false);
	});
});
