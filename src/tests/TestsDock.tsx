import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProblemFile } from "@/problems/model";
import ProblemsPanel from "@/problems/ProblemsPanel";
import type { FileBuffer } from "@/project/buffer";
import {
	applyTestFilters,
	type ResultFilter,
	resultLabel,
	type SortDir,
} from "@/tests/filterTests";
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
		onSelect: (path: string, line?: number, character?: number) => void;
		root: string | null;
		buffers: FileBuffer[];
		setBuffers: (updater: (current: FileBuffer[]) => FileBuffer[]) => void;
	};
	tests: TestsController;
};

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
	const [binaryFilter, setBinaryFilter] = useState<string | null>(null);
	const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
	const [sort, setSort] = useState<SortDir>("az");
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
	const [highlighted, setHighlighted] = useState(-1);
	const filterRef = useRef<HTMLInputElement | null>(null);
	const { load } = tests;

	const binaries = useMemo(() => {
		const counts = new Map<string, number>();
		for (const item of tests.items) {
			counts.set(item.binary, (counts.get(item.binary) ?? 0) + 1);
		}
		return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	}, [tests.items]);

	const filtered = useMemo(
		() =>
			applyTestFilters(tests.items, tests.results, {
				text: filter,
				binary: binaryFilter,
				result: resultFilter,
				sort,
			}),
		[tests.items, tests.results, filter, binaryFilter, resultFilter, sort],
	);

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

	const runningAll = tests.runAllProgress !== null;
	const progressLabel =
		tests.runAllProgress === null
			? null
			: `running ${tests.runAllProgress.done}/${tests.runAllProgress.total}`;

	const toggleGroup = (binary: string) => {
		setCollapsedGroups((current) => {
			const next = new Set(current);
			if (next.has(binary)) {
				next.delete(binary);
			} else {
				next.add(binary);
			}
			return next;
		});
	};

	const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setHighlighted((current) => {
				if (filtered.length === 0) {
					return -1;
				}
				if (current < 0) {
					return 0;
				}
				return Math.min(current + 1, filtered.length - 1);
			});
			return;
		}
		if (event.key === "Enter") {
			if (highlighted >= 0 && highlighted < filtered.length) {
				event.preventDefault();
				tests.runOne(filtered[highlighted].name);
			}
			return;
		}
		if (event.key === "Escape") {
			setHighlighted(-1);
		}
	};

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
						{failed > 0 ? (
							<span className="dock-tab-count bad">{failed} failed</span>
						) : null}
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
							disabled={runningAll}
							onChange={(event) => {
								setFilter(event.target.value);
								setHighlighted(-1);
							}}
							onKeyDown={onKeyDown}
						/>
						<select
							className="dock-filter"
							aria-label="Filter by binary"
							disabled={runningAll}
							value={binaryFilter ?? ""}
							onChange={(event) => {
								setBinaryFilter(
									event.target.value === "" ? null : event.target.value,
								);
								setHighlighted(-1);
							}}
						>
							<option value="">All binaries</option>
							{binaries.map(([binary, count]) => (
								<option key={binary} value={binary}>
									{binary} ({count})
								</option>
							))}
						</select>
						<div className="dock-segmented">
							{(["all", "failed", "passed", "notrun"] as ResultFilter[]).map(
								(value) => (
									<button
										key={value}
										type="button"
										className={
											resultFilter === value ? "dock-seg active" : "dock-seg"
										}
										disabled={runningAll}
										onClick={() => {
											setResultFilter(value);
											setHighlighted(-1);
										}}
									>
										{resultLabel(value)}
									</button>
								),
							)}
						</div>
						<button
							type="button"
							className="dock-action"
							disabled={runningAll}
							onClick={() => setSort((current) => (current === "az" ? "za" : "az"))}
						>
							{sort === "az" ? "A→Z" : "Z→A"}
						</button>
						{progressLabel === null ? null : (
							<span className="dock-progress">{progressLabel}</span>
						)}
						<button
							type="button"
							className="dock-action"
							onClick={() => tests.clearResults()}
						>
							clear results
						</button>
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
							collapsedGroups={collapsedGroups}
							onToggleGroup={toggleGroup}
							highlighted={highlighted}
							onRun={tests.runOne}
							textFilter={filter}
							binaryFilter={binaryFilter}
							resultFilter={resultFilter}
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
							root={problems.root}
							buffers={problems.buffers}
							setBuffers={problems.setBuffers}
						/>
					)}
				</div>
			) : null}
		</section>
	);
}
