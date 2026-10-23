import type { TestsController } from "@/lib/tests/useTests";
import type { DockFilters } from "./useDockFilters";
import { resultLabel, type ResultFilter } from "@/lib/tests/filterTests";

export function DockTools({ dock, tests }: { dock: DockFilters; tests: TestsController }) {
	const runningAll = tests.runAllProgress !== null;
	const progressLabel =
		tests.runAllProgress === null
			? null
			: `running ${tests.runAllProgress.done}/${tests.runAllProgress.total}`;
	return (
		<div className="dock-tools">
			<input
				ref={dock.filterRef}
				className="dock-filter"
				type="text"
				value={dock.filter}
				placeholder="filter tests"
				aria-label="Filter tests"
				disabled={runningAll}
				onChange={(event) => dock.changeFilter(event.target.value)}
				onKeyDown={dock.onKeyDown}
			/>
			<select
				className="dock-filter"
				aria-label="Filter by binary"
				disabled={runningAll}
				value={dock.binaryFilter ?? ""}
				onChange={(event) => {
					dock.changeBinary(event.target.value === "" ? null : event.target.value);
				}}
			>
				<option value="">All binaries</option>
				{dock.binaries.map(([binary, count]) => (
					<option key={binary} value={binary}>
						{binary} ({count})
					</option>
				))}
			</select>
			<div className="dock-segmented">
				{(["all", "failed", "passed", "notrun"] as ResultFilter[]).map((value) => (
					<button
						key={value}
						type="button"
						className={dock.resultFilter === value ? "dock-seg active" : "dock-seg"}
						aria-pressed={dock.resultFilter === value}
						disabled={runningAll}
						onClick={() => dock.changeResult(value)}
					>
						{resultLabel(value)}
					</button>
				))}
			</div>
			<button
				type="button"
				className="dock-action"
				aria-pressed={dock.sort === "za"}
				disabled={runningAll}
				onClick={dock.toggleSort}
			>
				{dock.sort === "az" ? "A→Z" : "Z→A"}
			</button>
			{progressLabel === null ? null : <span className="dock-progress">{progressLabel}</span>}
			<button type="button" className="dock-action" onClick={() => tests.clearResults()}>
				clear results
			</button>
			<button
				type="button"
				className="dock-action"
				disabled={dock.failed === 0}
				onClick={(event) => void dock.copyFailures(event)}
			>
				copy failures
			</button>
			<button
				type="button"
				className="dock-action"
				disabled={dock.failed === 0 || tests.running.size > 0}
				onClick={() => {
					const names = tests.items
						.filter((item) => {
							const report = tests.results.get(item.name);
							return report !== undefined && !report.passed;
						})
						.map((item) => item.name);
					if (names.length === 0) {
						tests.runAll([]);
						return;
					}
					tests.runAll(names);
				}}
			>
				rerun failed
			</button>
			{dock.copyStatus === null ? null : (
				<span className="dock-copy-status">{dock.copyStatus}</span>
			)}
			<button
				type="button"
				className="dock-action"
				disabled={dock.filtered.length === 0 || tests.running.size > 0}
				onClick={() => tests.runAll(dock.filtered.map((item) => item.name))}
			>
				run all
			</button>
		</div>
	);
}
