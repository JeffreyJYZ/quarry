import { describe, expect, test } from "bun:test";
import type { TestItem, TestReport } from "@/lib/project/api";
import { testMarkers } from "@/lib/tests/gutter";

/** `TEST` at 3, `TEST_F` at 7, `TYPED_TEST` at 11, a commented macro at 14. */
const SOURCE = [
	"#include <gtest/gtest.h>",
	"",
	"TEST(Math, Adds) {",
	"    EXPECT_EQ(1 + 1, 2);",
	"}",
	"",
	"TEST_F(MathFixture, HandlesError) {",
	"    EXPECT_TRUE(true);",
	"}",
	"",
	"TYPED_TEST(IntTypes, Doubles) {",
	"    EXPECT_EQ(1, 1);",
	"}",
	"// TEST(Ghost, NeverRuns) {",
	"}",
].join("\n");

const PATH = "/project/tests/math_test.cpp";

const ITEMS: TestItem[] = [
	{ name: "Math.Adds", binary: "/project/build/tests", suite: "gtest" },
	{ name: "MathFixture.HandlesError", binary: "/project/build/tests", suite: "gtest" },
	{ name: "IntTypes.Doubles", binary: "/project/build/tests", suite: "gtest" },
];

function report(name: string, passed: boolean): TestReport {
	return { name, passed, output: "", durationMs: 1 };
}

function markers(items: TestItem[], results = new Map<string, TestReport>()) {
	return testMarkers({ path: PATH, text: SOURCE, items, results, running: new Set() });
}

describe("the C++ test gutter", () => {
	test("places a marker from TEST, TEST_F and TYPED_TEST on the macro's own line", () => {
		expect(markers(ITEMS).map((marker) => [marker.line, marker.kind, marker.name])).toEqual([
			[3, "test", "Math.Adds"],
			[7, "test", "MathFixture.HandlesError"],
			[11, "test", "IntTypes.Doubles"],
		]);
	});

	test("a case the backend lists but the file never declares gets no marker", () => {
		const listed = [...ITEMS, { name: "Math.Missing", binary: "/p/tests", suite: "gtest" }];

		expect(markers(listed).map((marker) => marker.name)).toEqual([
			"Math.Adds",
			"MathFixture.HandlesError",
			"IntTypes.Doubles",
		]);
	});

	test("a file with no macros places nothing", () => {
		const none = testMarkers({
			path: PATH,
			text: "int main() { return 0; }",
			items: ITEMS,
			results: new Map(),
			running: new Set(),
		});

		expect(none).toEqual([]);
	});

	test("a macro quoted in a comment places nothing", () => {
		const quoted = testMarkers({
			path: PATH,
			text: '// TEST(Ghost, NeverRuns)\nconst char *s = "TEST(Ghost, AlsoNever)";',
			items: [{ name: "Ghost.NeverRuns", binary: "/p/t", suite: "gtest" }],
			results: new Map(),
			running: new Set(),
		});

		expect(quoted).toEqual([]);
	});

	test("a marker runs the one case behind it, and carries the dock's state", () => {
		const results = new Map([["Math.Adds", report("Math.Adds", false)]]);
		const placed = markers(ITEMS, results);

		expect(placed[0]?.group).toEqual(["Math.Adds"]);
		expect(placed.map((marker) => marker.state)).toEqual(["failed", "idle", "idle"]);
	});

	test("Cargo items never place a marker in a C++ file", () => {
		const cargo = [{ name: "tests::adds", binary: "src/lib.rs", suite: "cargo" }];

		expect(markers(cargo)).toEqual([]);
	});
});
