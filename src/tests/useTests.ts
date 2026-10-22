import { useCallback, useEffect, useRef, useState } from "react";
import { listTests, runTest, type TestItem, type TestReport } from "@/project/api";
import { describeError } from "@/project/errors";

const NO_RESULTS: ReadonlyMap<string, TestReport> = new Map();
const NO_RUNNING: ReadonlySet<string> = new Set();

export type TestsController = {
	/** Tests the backend knows about, for the current project only. */
	items: TestItem[];
	/** True while `listTests` is in flight. */
	loading: boolean;
	/** One line describing a failed `listTests` call. */
	loadError: string | null;
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
	/** Runs one test; a second call while it runs is ignored. */
	runOne: (name: string) => void;
	/** Runs the given names in order, stopping after the first failure. */
	runAll: (names: string[]) => void;
	/** Empties the results map without touching the list. */
	clearResults: () => void;
};

/**
 * Owns the test list and the run results for one project.
 *
 * The results live here, above the dock, so a tab switch or a closed dock keeps them and only a
 * different project clears them. Every rejected command becomes one line, never a thrown error.
 */
export function useTests(root: string | null): TestsController {
	const [items, setItems] = useState<TestItem[]>([]);
	const [itemsFor, setItemsFor] = useState<string | null>(null);
	const [results, setResults] = useState<Map<string, TestReport>>(new Map());
	const [resultsFor, setResultsFor] = useState<string | null>(null);
	const [running, setRunning] = useState<ReadonlySet<string>>(new Set());
	const [loading, setLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [summary, setSummary] = useState<string | null>(null);
	const [runAllProgress, setRunAllProgress] = useState<{ done: number; total: number } | null>(
		null,
	);
	const loadingRef = useRef(false);
	const loadedFor = useRef<string | null>(null);
	const runningRef = useRef<Set<string>>(new Set());
	const runningAll = useRef(false);

	/* A different project starts from an empty list and no results. */
	useEffect(() => {
		setItems([]);
		setItemsFor(root);
		setResults(new Map());
		setResultsFor(null);
		setRunning(new Set());
		setLoadError(null);
		setSummary(null);
		setRunAllProgress(null);
		loadedFor.current = null;
		runningRef.current = new Set();
	}, [root]);

	const load = useCallback(() => {
		if (root === null || loadingRef.current || loadedFor.current === root) {
			return;
		}
		const target = root;
		loadingRef.current = true;
		setLoading(true);
		setLoadError(null);
		void (async () => {
			try {
				const found = await listTests(target);
				loadedFor.current = target;
				setItems(found);
				setItemsFor(target);
			} catch (error) {
				setLoadError(describeError(error));
			} finally {
				loadingRef.current = false;
				setLoading(false);
			}
		})();
	}, [root]);

	const runOne = useCallback(
		async (name: string): Promise<TestReport | null> => {
			if (root === null || runningRef.current.has(name)) {
				return null;
			}
			const target = root;
			runningRef.current.add(name);
			setRunning(new Set(runningRef.current));
			let report: TestReport;
			try {
				report = await runTest(target, name);
			} catch (error) {
				report = { name, passed: false, output: describeError(error), durationMs: 0 };
			}
			setResults((current) => {
				const next = new Map(current);
				next.set(name, report);
				return next;
			});
			setResultsFor(target);
			runningRef.current.delete(name);
			setRunning(new Set(runningRef.current));
			return report;
		},
		[root],
	);

	/* `Run all` walks the filtered list in order and stops at the first failure. */
	const runAll = useCallback(
		async (names: string[]): Promise<void> => {
			if (root === null || names.length === 0 || runningAll.current) {
				return;
			}
			runningAll.current = true;
			setRunAllProgress({ done: 0, total: names.length });
			let passed = 0;
			let failed = 0;
			let stopped: string | null = null;
			let done = 0;
			try {
				for (const name of names) {
					const report = await runOne(name);
					done += 1;
					setRunAllProgress({ done, total: names.length });
					if (report === null) {
						continue;
					}
					if (report.passed) {
						passed += 1;
						continue;
					}
					failed += 1;
					stopped = name;
					break;
				}
			} finally {
				runningAll.current = false;
				setRunAllProgress(null);
			}
			const total = passed + failed;
			setSummary(
				stopped === null
					? `${passed} of ${total} passed`
					: `${passed} of ${total} passed, stopped at ${stopped}`,
			);
		},
		[root, runOne],
	);

	const clearResults = useCallback(() => {
		setResults(new Map());
		setResultsFor(root);
	}, [root]);

	/* Results from another project never show up in this one. */
	const visibleItems = itemsFor === root ? items : [];
	const visibleResults = resultsFor === root ? results : NO_RESULTS;

	return {
		items: visibleItems,
		loading,
		loadError,
		results: visibleResults,
		running: running.size > 0 ? running : NO_RUNNING,
		summary,
		runAllProgress,
		load,
		runOne: (name: string) => {
			void runOne(name);
		},
		runAll: (names: string[]) => {
			void runAll(names);
		},
		clearResults,
	};
}
