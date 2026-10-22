import { useEffect, useMemo, useRef, useState } from "react";
import type { ProblemFile } from "@/problems/model";
import ProblemsPanel from "@/problems/ProblemsPanel";
import type { TestItem } from "@/project/api";
import TestsPanel from "@/tests/TestsPanel";
import type { TestsController } from "@/tests/useTests";

export type DockTab = "tests" | "problems";

export type TestsDockProps = {
	/** Which view the dock shows; the other one is hidden, never stacked below it. */
	tab: DockTab;
	/** True when the dock body is visible. */
	expanded: boolean;
	onToggleExpanded: () => void;
	onSelectTab: (tab: DockTab) => void;
	problems: {
		files: ProblemFile[];
		errors: number;
		warnings: number;
		activePath: string | null;
		onSelect: (path: string) => void;
	};
	tests: TestsController;
};

/** Case-insensitive substring filter over the test name and its binary. */
function filterTests(items: TestItem[], filter: string): TestItem[] {
	const needle = filter.trim().toLowerCase();
	if (needle === "") {
		return items;
	}
	return items.filter(
		(item) =>
			item.name.toLowerCase().includes(needle) || item.binary.toLowerCase().includes(needle),
	);
}

/**
 * The bottom dock. Tests and problems share one region: the header carries both tabs and the
 * body shows the active one, so the editor never grows a second stacked panel.
 */
export default function TestsDock({
	tab,
	expanded,
	onToggleExpanded,
	onSelectTab,
	problems,
	tests,
}: TestsDockProps) {
	const [filter, setFilter] = useState("");
	const filterRef = useRef<HTMLInputElement | null>(null);
	const { load } = tests;
	const filtered = useMemo(() => filterTests(tests.items, filter), [tests.items, filter]);

	/* The test list loads once, the first time the tests tab is opened. */
	useEffect(() => {
		if (tab === "tests") {
			load();
		}
	}, [tab, load]);

	/* The filter takes the focus when the tests view opens. */
	useEffect(() => {
		if (tab === "tests" && expanded) {
			filterRef.current?.focus();
		}
	}, [tab, expanded]);

	const failed = useMemo(() => {
		let count = 0;
		for (const report of tests.results.values()) {
			if (!report.passed) {
				count += 1;
			}
		}
		return count;
	}, [tests.results]);

	const testsTab = tab === "tests" ? "dock-tab active" : "dock-tab";
	const problemsTab = tab === "problems" ? "dock-tab active" : "dock-tab";
	const testsCount = failed > 0 ? "dock-tab-count bad" : "dock-tab-count";
	const problemsCount = problems.errors > 0 ? "dock-tab-count bad" : "dock-tab-count";

	return (
		<section className={expanded ? "dock" : "dock collapsed"} aria-label="Bottom dock">
			<div className="dock-head">
				<button
					type="button"
					className="dock-toggle"
					aria-expanded={expanded}
					aria-label={expanded ? "Collapse dock" : "Expand dock"}
					onClick={onToggleExpanded}
				>
					<span
						className={expanded ? "problems-caret open" : "problems-caret"}
						aria-hidden="true"
					/>
				</button>
				<div className="dock-tabs">
					<button
						type="button"
						className={testsTab}
						aria-pressed={tab === "tests"}
						onClick={() => onSelectTab("tests")}
					>
						Tests
						<span className={testsCount}>{tests.items.length}</span>
					</button>
					<button
						type="button"
						className={problemsTab}
						aria-pressed={tab === "problems"}
						onClick={() => onSelectTab("problems")}
					>
						Problems
						<span className={problemsCount}>{problems.errors}</span>
					</button>
				</div>
				{tab === "tests" ? (
					<div className="dock-tools">
						<input
							ref={filterRef}
							className="dock-filter"
							type="text"
							value={filter}
							placeholder="filter tests"
							aria-label="Filter tests"
							onChange={(event) => setFilter(event.target.value)}
						/>
						<button
							type="button"
							className="dock-action"
							disabled={filtered.length === 0 || tests.running.size > 0}
							onClick={() => tests.runAll(filtered.map((item) => item.name))}
						>
							run all
						</button>
					</div>
				) : null}
			</div>
			{expanded ? (
				<div className="dock-body">
					{tab === "tests" ? (
						<TestsPanel
							items={filtered}
							loading={tests.loading}
							loadError={tests.loadError}
							results={tests.results}
							running={tests.running}
							summary={tests.summary}
							onRun={tests.runOne}
						/>
					) : (
						<ProblemsPanel
							files={problems.files}
							errors={problems.errors}
							warnings={problems.warnings}
							open
							onToggle={onToggleExpanded}
							onSelect={problems.onSelect}
							activePath={problems.activePath}
						/>
					)}
				</div>
			) : null}
		</section>
	);
}
