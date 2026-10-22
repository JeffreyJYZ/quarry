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
