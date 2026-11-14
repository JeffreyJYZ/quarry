/**
 * What the Windows test-runner row decides, kept apart from how it is measured.
 *
 * A row that could only be judged on `windows-latest` would ship its decision logic unmeasured, so
 * every rule lives here as a function over the product's own JSON and is unit-tested on any
 * machine; `rows.ts` only supplies the data.
 */

export interface DiscoveryItem {
	name: string;
	/** The test binary: the gtest program, or the Cargo source path the `Running …` header named. */
	binary: string;
	/** `gtest` or `cargo`, the label the dock groups by. */
	suite: string;
}

export interface Discovery {
	items: DiscoveryItem[];
	program: string | null;
	/** One sentence per source that could not be listed, or that listed nothing. */
	notes: string[];
}

export interface Report {
	name: string;
	passed: boolean;
	output: string;
	durationMs: number;
}

export type Verdict = "PASS" | "FAIL" | "SKIP" | "n/a";

/** The case the tree must hold, or null when discovery never named it. */
export function findTest(discovery: Discovery, name: string, suite?: string): DiscoveryItem | null {
	return (
		discovery.items.find(
			(item) => item.name === name && (suite === undefined || item.suite === suite),
		) ?? null
	);
}

/** The note that proves a discovery run was killed at the product's own bound, or null. */
export function timeoutNote(discovery: Discovery, seconds: number): string | null {
	const wanted = `timed out after ${seconds} s`;
	return discovery.notes.find((note) => note.includes(wanted)) ?? null;
}

/** Whether a case run carried the body's own output and reported success. */
export function caseCarried(report: Report | null, token: string): boolean {
	if (report === null) return false;
	return report.passed && report.output.includes(token);
}

/**
 * Whether a one-case run stayed inside its case.
 *
 * The dock runs `--gtest_filter=Suite.Case`; a sibling's output in the report means the filter never
 * reached the binary, which a report holding the right token alone cannot tell apart.
 */
export function onlyCaseRan(report: Report | null, sibling: string): boolean {
	if (report === null) return false;
	return !report.output.includes(sibling);
}

/**
 * The case run a CASE_OUTPUT token is looked for in.
 *
 * The dock tails both streams into `output`; a passing report whose output never reached the panel
 * is a run that produced nothing to read, which is the defect this distinguishes from a failed
 * test.
 */
export function describeRun(report: Report | null): string {
	if (report === null) return "no report";
	const state = report.passed ? "passed" : "failed";
	const lines = report.output.split(/\r?\n/).filter((line) => line.trim() !== "").length;
	return `${state}, ${lines} output line(s), ${report.durationMs}ms`;
}
