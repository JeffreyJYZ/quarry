import { describe, expect, test } from "bun:test";
import type { TestItem, TestReport } from "@/lib/project/api";
import { groupState, testMarkers } from "@/lib/tests/gutter";

/** `mod tests` at 4, `fn adds` at 8, `mod inner` at 12, `fn nested` at 14, `mod helpers` at 20. */
const LIB = [
	"use std::io;",
	"",
	"#[cfg(test)]",
	"mod tests {",
	"    use super::*;",
	"",
	"    #[test]",
	"    fn adds() {",
	'        assert_eq!(1 + 1, 2, "one {two}");',
	"    }",
	"",
	"    mod inner {",
	"        #[test]",
	"        fn nested() {",
	'            let braces = "{ not code }";',
	"        }",
	"    }",
	"}",
	"",
	"mod helpers {",
	"    fn nothing() {}",
	"}",
].join("\n");

const PATH = "/project/src/lib.rs";

const ITEMS: TestItem[] = [
	{ name: "tests::adds", binary: "src/lib.rs" },
	{ name: "tests::inner::nested", binary: "src/lib.rs" },
];

function report(name: string, passed: boolean): TestReport {
	return { name, passed, output: "", durationMs: 1 };
}

describe("the test gutter's markers", () => {
	test("puts a test marker on each known test line and a group marker on its module header", () => {
		const markers = testMarkers({
			path: PATH,
			text: LIB,
			items: ITEMS,
			results: new Map(),
			running: new Set(),
		});

		expect(markers.map((marker) => [marker.line, marker.kind, marker.name])).toEqual([
			[4, "group", "tests"],
			[8, "test", "tests::adds"],
			[12, "group", "tests::inner"],
			[14, "test", "tests::inner::nested"],
		]);
	});

	test("a test runs itself, and its module runs every test under it, in file order", () => {
		const markers = testMarkers({
			path: PATH,
			text: LIB,
			items: ITEMS,
			results: new Map(),
			running: new Set(),
		});

		expect(markers.find((marker) => marker.kind === "test")?.group).toEqual([
			"tests::adds",
			"tests::inner::nested",
		]);
		expect(markers.find((marker) => marker.name === "tests::inner")?.group).toEqual([
			"tests::inner::nested",
		]);
		expect(markers.find((marker) => marker.name === "tests::inner::nested")?.group).toEqual([
			"tests::inner::nested",
		]);
	});

	test("an enclosing module that only holds nested tests still gets its own marker", () => {
		const markers = testMarkers({
			path: PATH,
			text: LIB,
			items: [{ name: "tests::inner::nested", binary: "src/lib.rs" }],
			results: new Map(),
			running: new Set(),
		});

		expect(markers.map((marker) => [marker.line, marker.kind])).toEqual([
			[4, "group"],
			[12, "group"],
			[14, "test"],
		]);
	});

	test("maps the dock's state onto the marker, a failure failing its whole group", () => {
		const results = new Map([
			["tests::adds", report("tests::adds", false)],
			["tests::inner::nested", report("tests::inner::nested", true)],
		]);
		const markers = testMarkers({
			path: PATH,
			text: LIB,
			items: ITEMS,
			results,
			running: new Set(),
		});

		expect(markers.map((marker) => marker.state)).toEqual([
			"failed",
			"failed",
			"passed",
			"passed",
		]);
	});

	test("shows a running test and its group as running even with an older result", () => {
		const results = new Map([["tests::adds", report("tests::adds", true)]]);
		const markers = testMarkers({
			path: PATH,
			text: LIB,
			items: ITEMS,
			results,
			running: new Set(["tests::adds"]),
		});

		expect(markers.map((marker) => marker.state)).toEqual([
			"running",
			"running",
			"idle",
			"idle",
		]);
	});

	test("a file with no tests gets none, and another file's tests stay off this file", () => {
		const none = testMarkers({
			path: PATH,
			text: "fn adds() {}",
			items: ITEMS,
			results: new Map(),
			running: new Set(),
		});
		const elsewhere = testMarkers({
			path: PATH,
			text: LIB,
			items: [{ name: "tests::adds", binary: "src/main.rs" }],
			results: new Map(),
			running: new Set(),
		});
		const notRust = testMarkers({
			path: "/project/src/main.cpp",
			text: LIB,
			items: ITEMS,
			results: new Map(),
			running: new Set(),
		});

		expect(none).toEqual([]);
		expect(elsewhere).toEqual([]);
		expect(notRust).toEqual([]);
	});

	test("accepts a test name carrying a crate prefix the file does not spell", () => {
		const markers = testMarkers({
			path: PATH,
			text: LIB,
			items: [{ name: "quarry_lib::tests::adds", binary: "src/lib.rs" }],
			results: new Map(),
			running: new Set(),
		});

		expect(markers.map((marker) => [marker.line, marker.name])).toEqual([
			[4, "tests"],
			[8, "quarry_lib::tests::adds"],
		]);
	});

	test("a group stays idle until every child has a result", () => {
		const results = new Map([["tests::adds", report("tests::adds", true)]]);

		expect(groupState(["tests::adds", "tests::inner::nested"], results, new Set())).toBe(
			"idle",
		);
		expect(groupState(["tests::adds"], results, new Set())).toBe("passed");
	});
});
