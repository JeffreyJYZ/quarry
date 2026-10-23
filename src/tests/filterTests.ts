import type { TestItem, TestReport } from "@/project/api";

export type ResultFilter = "all" | "failed" | "passed" | "notrun";
export type SortDir = "az" | "za";

export type TestFilterOptions = {
	text: string;
	binary: string | null;
	result: ResultFilter;
	sort: SortDir;
};

const RESULT_LABEL: Record<ResultFilter, string> = {
	all: "All",
	failed: "Failed",
	passed: "Passed",
	notrun: "Not run",
};

export function resultLabel(value: ResultFilter): string {
	return RESULT_LABEL[value];
}

export function statusOf(item: TestItem, results: ReadonlyMap<string, TestReport>): ResultFilter {
	const report = results.get(item.name);
	if (report === undefined) {
		return "notrun";
	}
	return report.passed ? "passed" : "failed";
}

/** Case-insensitive match against a test's name and its binary (file path). */
export function matchesTestFilter(item: TestItem, needle: string): boolean {
	const query = needle.trim().toLowerCase();
	if (query === "") {
		return true;
	}
	return item.name.toLowerCase().includes(query) || item.binary.toLowerCase().includes(query);
}

/** One `path::test_name` line per failed test, in list order. */
export function composeFailureLines(
	items: TestItem[],
	results: ReadonlyMap<string, TestReport>,
): string[] {
	const lines: string[] = [];
	for (const item of items) {
		const report = results.get(item.name);
		if (report === undefined || report.passed) {
			continue;
		}
		lines.push(item.name);
	}
	return lines;
}

/** Caps a failure output and reports whether anything was dropped. */
export function truncateFailureOutput(
	output: string,
	limit: number = 200,
): { text: string; truncated: boolean } {
	const lines = output.split("\\n");
	if (lines.length <= limit) {
		return { text: output, truncated: false };
	}
	return { text: lines.slice(0, limit).join("\\n"), truncated: true };
}

export function applyTestFilters(
	items: TestItem[],
	results: ReadonlyMap<string, TestReport>,
	options: TestFilterOptions,
): TestItem[] {
	const needle = options.text.trim().toLowerCase();
	const out: TestItem[] = [];
	for (const item of items) {
		if (
			needle !== "" &&
			!item.name.toLowerCase().includes(needle) &&
			!item.binary.toLowerCase().includes(needle)
		) {
			continue;
		}
		if (options.binary !== null && item.binary !== options.binary) {
			continue;
		}
		const status = statusOf(item, results);
		if (options.result !== "all" && status !== options.result) {
			continue;
		}
		out.push(item);
	}
	out.sort((a, b) => {
		const cmp = a.name.localeCompare(b.name);
		return options.sort === "az" ? cmp : -cmp;
	});
	return out;
}
