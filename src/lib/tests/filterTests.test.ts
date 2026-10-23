import { describe, expect, test } from "bun:test";
import type { TestItem, TestReport } from "@/lib/project/api";
import {
	applyTestFilters,
	composeFailureLines,
	matchesTestFilter,
	resultLabel,
	statusOf,
	type TestFilterOptions,
	truncateFailureOutput,
} from "@/lib/tests/filterTests";

const item = (name: string, binary: string): TestItem => ({ name, binary });
const report = (passed: boolean): TestReport => ({
	name: "x",
	passed,
	output: "",
	durationMs: 1,
});

const options = (overrides: Partial<TestFilterOptions> = {}): TestFilterOptions => ({
	text: "",
	binary: null,
	result: "all",
	sort: "az",
	...overrides,
});

const ITEMS = [
	item("parser::reads_tokens", "lib"),
	item("parser::writes_tokens", "lib"),
	item("store::loads", "lib"),
	item("cli::parses", "cli"),
];

const RESULTS = new Map<string, TestReport>([
	["parser::reads_tokens", report(true)],
	["parser::writes_tokens", report(false)],
]);

describe("statusOf", () => {
	test("reports not run for tests with no result", () => {
		expect(statusOf(ITEMS[2], RESULTS)).toBe("notrun");
	});

	test("reports passed and failed from the stored report", () => {
		expect(statusOf(ITEMS[0], RESULTS)).toBe("passed");
		expect(statusOf(ITEMS[1], RESULTS)).toBe("failed");
	});
});

describe("applyTestFilters", () => {
	test("matches the text filter against the name and the binary", () => {
		const byName = applyTestFilters(ITEMS, RESULTS, options({ text: "tokens" }));
		expect(byName.map((entry) => entry.name)).toEqual([
			"parser::reads_tokens",
			"parser::writes_tokens",
		]);
		const byBinary = applyTestFilters(ITEMS, RESULTS, options({ text: "cli" }));
		expect(byBinary.map((entry) => entry.name)).toEqual(["cli::parses"]);
	});

	test("narrows to one binary when a binary is selected", () => {
		const rows = applyTestFilters(ITEMS, RESULTS, options({ binary: "lib" }));
		expect(rows).toHaveLength(3);
		expect(rows.every((entry) => entry.binary === "lib")).toBe(true);
	});

	test("narrows by result state, including the not-run bucket", () => {
		expect(applyTestFilters(ITEMS, RESULTS, options({ result: "failed" }))).toHaveLength(1);
		expect(applyTestFilters(ITEMS, RESULTS, options({ result: "passed" }))).toHaveLength(1);
		expect(applyTestFilters(ITEMS, RESULTS, options({ result: "notrun" }))).toHaveLength(2);
	});

	test("composes the text, binary and result filters", () => {
		const rows = applyTestFilters(
			ITEMS,
			RESULTS,
			options({ text: "parser", binary: "lib", result: "failed" }),
		);
		expect(rows.map((entry) => entry.name)).toEqual(["parser::writes_tokens"]);
	});

	test("sorts descending when asked, after filtering", () => {
		const rows = applyTestFilters(ITEMS, RESULTS, options({ sort: "za" }));
		expect(rows.map((entry) => entry.name)).toEqual([
			"store::loads",
			"parser::writes_tokens",
			"parser::reads_tokens",
			"cli::parses",
		]);
	});

	test("returns nothing when the filters exclude everything", () => {
		expect(applyTestFilters(ITEMS, RESULTS, options({ text: "no-such-test" }))).toEqual([]);
	});
});

describe("resultLabel", () => {
	test("labels each result filter for the segmented control", () => {
		expect(resultLabel("all")).toBe("All");
		expect(resultLabel("failed")).toBe("Failed");
		expect(resultLabel("passed")).toBe("Passed");
		expect(resultLabel("notrun")).toBe("Not run");
	});
});

describe("matchesTestFilter", () => {
	test("matches case-insensitively against name and path", () => {
		const item = { name: "Foo::Bar", binary: "src/Lib.rs" };
		expect(matchesTestFilter(item, "foo")).toBe(true);
		expect(matchesTestFilter(item, "LIB.RS")).toBe(true);
		expect(matchesTestFilter(item, "nope")).toBe(false);
	});
});

describe("composeFailureLines", () => {
	test("emits path::name for failed tests only", () => {
		const items = [item("a::t", "lib"), item("b::t", "lib")];
		const results = new Map<string, TestReport>([
			["a::t", report(false)],
			["b::t", report(true)],
		]);
		expect(composeFailureLines(items, results)).toEqual(["a::t"]);
	});
});

describe("truncateFailureOutput", () => {
	test("truncates long output and reports it", () => {
		const output = Array.from({ length: 5 }, (_, i) => `line ${i}`).join("\\n");
		const result = truncateFailureOutput(output, 2);
		expect(result.truncated).toBe(true);
		expect(result.text).toBe("line 0\\nline 1");
	});

	test("leaves short output alone", () => {
		const output = "a\\nb";
		const result = truncateFailureOutput(output, 2);
		expect(result.truncated).toBe(false);
		expect(result.text).toBe(output);
	});
});
