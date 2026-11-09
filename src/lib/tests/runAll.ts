import type { TestReport } from "@/lib/project/api";

export type RunAllResult = { passed: number; failed: number; stopped: string | null };

/**
 * Walk the chosen tests in order, stopping at the first failure.
 *
 * `isCurrent` is the run's generation check. A project switch retires the run — it no longer
 * describes what is on screen — so the walk returns `null` and reports no further progress. Without
 * that check the old project's walk kept writing "running 3/10" into the new project's dock, which
 * is a progress line for a task that is not running there.
 */
export async function runAllTests(options: {
	names: string[];
	runOne: (name: string) => Promise<TestReport | null>;
	onProgress: (done: number, total: number) => void;
	isCurrent: () => boolean;
}): Promise<RunAllResult | null> {
	let passed = 0;
	let failed = 0;
	let stopped: string | null = null;
	let done = 0;
	for (const name of options.names) {
		const report = await options.runOne(name);
		if (!options.isCurrent()) return null;
		done += 1;
		options.onProgress(done, options.names.length);
		if (report === null) continue;
		if (report.passed) {
			passed += 1;
			continue;
		}
		failed += 1;
		stopped = name;
		break;
	}
	return { passed, failed, stopped };
}

/** One line summarising a finished walk. */
export function runAllSummary(result: RunAllResult): string {
	const total = result.passed + result.failed;
	return result.stopped === null
		? `${result.passed} of ${total} passed`
		: `${result.passed} of ${total} passed, stopped at ${result.stopped}`;
}
