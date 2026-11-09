import { describe, expect, test } from "bun:test";
import {
	clampIndex,
	firstChildIndex,
	flattenRows,
	type FlatRow,
	keyCommand,
	moveIndex,
	parentIndex,
	rowDomId,
} from "@/lib/tree/keys";

function row(path: string, depth: number, isDir = false): FlatRow {
	return { path, name: path.slice(path.lastIndexOf("/") + 1), isDir, depth };
}

describe("keyCommand", () => {
	test("arrows map to a one-row move or an expand/collapse", () => {
		expect(keyCommand({ key: "ArrowDown" })).toEqual({ kind: "move", delta: 1 });
		expect(keyCommand({ key: "ArrowUp" })).toEqual({ kind: "move", delta: -1 });
		expect(keyCommand({ key: "ArrowRight" })).toEqual({ kind: "expand" });
		expect(keyCommand({ key: "ArrowLeft" })).toEqual({ kind: "collapse" });
	});

	test("Enter and space activate the row", () => {
		expect(keyCommand({ key: "Enter" })).toEqual({ kind: "activate" });
		expect(keyCommand({ key: " " })).toEqual({ kind: "activate" });
	});

	test("F2 renames and Delete or Backspace deletes", () => {
		expect(keyCommand({ key: "F2" })).toEqual({ kind: "rename" });
		expect(keyCommand({ key: "Delete" })).toEqual({ kind: "delete" });
		expect(keyCommand({ key: "Backspace" })).toEqual({ kind: "delete" });
	});

	test("the context-menu keys stay with the row, not the tree container", () => {
		expect(keyCommand({ key: "ContextMenu" })).toBeNull();
		expect(keyCommand({ key: "F10", shiftKey: true })).toBeNull();
	});

	test("unrelated keys are ignored", () => {
		expect(keyCommand({ key: "a" })).toBeNull();
		expect(keyCommand({ key: "Tab" })).toBeNull();
	});
});

describe("clampIndex and moveIndex", () => {
	test("an empty list has no row", () => {
		expect(clampIndex(0, 0)).toBe(-1);
	});

	test("clamps past both ends", () => {
		expect(clampIndex(-3, 4)).toBe(0);
		expect(clampIndex(9, 4)).toBe(3);
	});

	test("moves one row and stops at the first and last", () => {
		expect(moveIndex(1, 1, 4)).toBe(2);
		expect(moveIndex(1, -1, 4)).toBe(0);
		expect(moveIndex(0, -1, 4)).toBe(0);
		expect(moveIndex(3, 1, 4)).toBe(3);
	});
});

describe("firstChildIndex", () => {
	const rows = [row("/r", 0, true), row("/r/a", 1), row("/r/b", 1), row("/r/c", 0)];

	test("an expanded directory's first child is the next row when it is one level deeper", () => {
		expect(firstChildIndex(rows, 0)).toBe(1);
	});

	test("a file has no child", () => {
		expect(firstChildIndex(rows, 1)).toBeNull();
	});

	test("the last row has no child", () => {
		expect(firstChildIndex(rows, 3)).toBeNull();
	});
});

describe("parentIndex", () => {
	const rows = [row("/r", 0, true), row("/r/a", 1, true), row("/r/a/x.ts", 2), row("/r/b", 1)];

	test("a child lands on the row one level up", () => {
		expect(parentIndex(rows, 2)).toBe(1);
		expect(parentIndex(rows, 3)).toBe(0);
	});

	test("a top-level row has no parent row", () => {
		expect(parentIndex(rows, 0)).toBeNull();
	});
});

const ROOT = "/p";
const ENTRIES = {
	"/p": [
		{ path: "/p/src", name: "src", isDir: true },
		{ path: "/p/README.md", name: "README.md", isDir: false },
	],
	"/p/src": [
		{ path: "/p/src/main.rs", name: "main.rs", isDir: false },
		{ path: "/p/src/lib", name: "lib", isDir: true },
	],
	"/p/src/lib": [{ path: "/p/src/lib/ops.rs", name: "ops.rs", isDir: false }],
};

const entriesOf = (dir: string) => ENTRIES[dir as keyof typeof ENTRIES];

describe("flattenRows", () => {
	test("a collapsed directory contributes one row, not its children", () => {
		const rows = flattenRows(entriesOf, new Set(), ROOT);
		expect(rows.map((r) => r.path)).toEqual(["/p/src", "/p/README.md"]);
		expect(rows.map((r) => r.depth)).toEqual([0, 0]);
	});

	test("expanding nests children directly below their directory, in paint order", () => {
		const rows = flattenRows(entriesOf, new Set(["/p/src"]), ROOT);
		expect(rows.map((r) => r.path)).toEqual([
			"/p/src",
			"/p/src/main.rs",
			"/p/src/lib",
			"/p/README.md",
		]);
		expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 0]);
	});

	test("each expanded level adds its own depth", () => {
		const rows = flattenRows(entriesOf, new Set(["/p/src", "/p/src/lib"]), ROOT);
		expect(rows.map((r) => r.path)).toEqual([
			"/p/src",
			"/p/src/main.rs",
			"/p/src/lib",
			"/p/src/lib/ops.rs",
			"/p/README.md",
		]);
		expect(rows.at(-2)?.depth).toBe(2);
	});

	test("a directory that has not loaded yet is skipped, not guessed", () => {
		expect(flattenRows(() => undefined, new Set(["/p/src"]), ROOT)).toEqual([]);
	});
});

describe("rowDomId", () => {
	test("encodes the path into a legal, stable id", () => {
		expect(rowDomId("/p/a b")).toBe("tree-row-%2Fp%2Fa%20b");
	});

	test("two different paths never share an id", () => {
		expect(rowDomId("/p/a_b")).not.toBe(rowDomId("/p/a/b"));
	});
});
