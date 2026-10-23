import type { TestItem, TestReport } from "@/lib/project/api";
import { type ResultFilter, resultLabel } from "@/lib/tests/filterTests";
import { groupByBinary } from "./parts";
import { TestGroups } from "./TestGroups";

export type TestsPanelProps = {
	items: TestItem[];
	totalCount?: number;
	loading: boolean;
	loadError: string | null;
	results: ReadonlyMap<string, TestReport>;
	running: ReadonlySet<string>;
	summary: string | null;
	collapsedGroups: ReadonlySet<string>;
	onToggleGroup: (binary: string) => void;
	highlighted: number;
	onRun: (name: string) => void;
	textFilter?: string;
	binaryFilter?: string | null;
	resultFilter?: ResultFilter;
};

export default function TestsPanel({
	items,
	totalCount,
	loading,
	loadError,
	results,
	running,
	summary,
	collapsedGroups,
	onToggleGroup,
	highlighted,
	onRun,
	textFilter = "",
	binaryFilter = null,
	resultFilter = "all",
}: TestsPanelProps) {
	const groups = groupByBinary(items);
	const summaryClass = summary?.includes("stopped at") ? " bad" : "";
	const total = totalCount ?? items.length;
	const failedCount = items.filter((item) => {
		const report = results.get(item.name);
		return report !== undefined && !report.passed;
	}).length;
	const notRunCount = items.filter((item) => results.get(item.name) === undefined).length;
	const emptyMessage = `No tests match "${textFilter}" · "${binaryFilter ?? "All binaries"}" · "${resultLabel(resultFilter)}"`;

	return (
		<div className="tests">
			{loading || loadError !== null ? null : (
				<p className="tests-summary">
					{items.length} of {total} tests · {failedCount} failed · {notRunCount} not run
				</p>
			)}
			{summary === null ? null : <p className={`tests-summary${summaryClass}`}>{summary}</p>}
			{loading ? <p className="problems-empty">Loading tests…</p> : null}
			{loadError === null ? null : <p className="problems-empty error">{loadError}</p>}
			{loading || loadError !== null ? null : (
				<TestGroups
					groups={groups}
					results={results}
					running={running}
					collapsedGroups={collapsedGroups}
					onToggleGroup={onToggleGroup}
					highlighted={highlighted}
					onRun={onRun}
					emptyMessage={emptyMessage}
				/>
			)}
		</div>
	);
}
