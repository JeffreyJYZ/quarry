/** The tests dock's controller shape and its empty defaults, kept out of the hook's body. */

import type { TestItem, TestReport } from "@/lib/project/api";

export const NO_RESULTS: ReadonlyMap<string, TestReport> = new Map();
export const NO_RUNNING: ReadonlySet<string> = new Set();

export type TestsController = {
	/** Tests the backend knows about, for the current project only. */
	items: TestItem[];
	/** True while `listTests` is in flight. */
	loading: boolean;
	/** One line describing a failed `listTests` call. */
	loadError: string | null;
	/** The gtest program discovery asked, when it asked one. */
	program: string | null;
	/** One plain sentence per source that could not be listed, or listed nothing. */
	notes: string[];
	/** Last report per test name, kept for the session. */
	results: ReadonlyMap<string, TestReport>;
	/** Names with a run in flight. */
	running: ReadonlySet<string>;
	/** One line summarising the last `Run all`. */
	summary: string | null;
	/** Progress of an in-flight `Run all`, or null. */
	runAllProgress: { done: number; total: number } | null;
	/** Loads the test list once per project; later calls are ignored. */
	load: () => void;
	/** Re-runs discovery for the current project, once it has been loaded at least once. */
	reload: () => void;
	/** Runs one test; a second call while it runs is ignored. */
	runOne: (name: string) => void;
	/** Runs the given names in order, stopping after the first failure. */
	runAll: (names: string[]) => void;
	/** Empties the results map without touching the list. */
	clearResults: () => void;
};
