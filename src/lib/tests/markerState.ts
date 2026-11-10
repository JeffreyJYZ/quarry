/** What a gutter marker shows: the dock's results, not a second source of truth. */

import type { TestReport } from "@/lib/project/api";

export type MarkerState = "idle" | "running" | "passed" | "failed";

/** The marker state the dock's results already describe. */
export function stateOf(
	name: string,
	results: ReadonlyMap<string, TestReport>,
	running: ReadonlySet<string>,
): MarkerState {
	if (running.has(name)) return "running";
	const report = results.get(name);
	if (report === undefined) return "idle";
	return report.passed ? "passed" : "failed";
}

/** A group runs as one: any live child is running, any failed child fails the group. */
export function groupState(
	names: readonly string[],
	results: ReadonlyMap<string, TestReport>,
	running: ReadonlySet<string>,
): MarkerState {
	if (names.some((name) => running.has(name))) return "running";
	const reports = names.map((name) => results.get(name));
	if (reports.some((report) => report?.passed === false)) return "failed";
	return reports.length > 0 && reports.every((report) => report?.passed === true)
		? "passed"
		: "idle";
}
