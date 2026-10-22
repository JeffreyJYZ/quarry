import { useState } from "react";
import type { TestItem, TestReport } from "@/project/api";

/** A failure output longer than this is cut; the rest of it stays on the backend. */
const OUTPUT_LINE_CAP = 200;

/** The glyph that marks a row with a run in flight. */
const RUNNING_GLYPH = "◦";

export type TestsPanelProps = {
	items: TestItem[];
	loading: boolean;
	loadError: string | null;
	results: ReadonlyMap<string, TestReport>;
	running: ReadonlySet<string>;
	summary: string | null;
	collapsedGroups: ReadonlySet<string>;
	onToggleGroup: (binary: string) => void;
	highlighted: number;
	onRun: (name: string) => void;
};

type TestGroup = {
	binary: string;
	tests: TestItem[];
};

/** Groups by binary, keeping the order the backend gave. */
function groupByBinary(items: TestItem[]): TestGroup[] {
	const groups: TestGroup[] = [];
	const index = new Map<string, TestGroup>();
	for (const item of items) {
		const existing = index.get(item.binary);
		if (existing !== undefined) {
			existing.tests.push(item);
			continue;
		}
		const group: TestGroup = { binary: item.binary, tests: [item] };
		index.set(item.binary, group);
		groups.push(group);
	}
	return groups;
}

/** Splits `module::path::name` into the dimmed prefix and the emphasised last segment. */
function splitName(name: string): { module: string; leaf: string } {
	const cut = name.lastIndexOf("::");
	if (cut <= 0) {
		return { module: "", leaf: name };
	}
	return { module: name.slice(0, cut + 2), leaf: name.slice(cut + 2) };
}

/** Cuts an output to the line cap and reports whether anything was dropped. */
function capOutput(output: string): { text: string; truncated: boolean } {
	const lines = output.split("\n");
	if (lines.length <= OUTPUT_LINE_CAP) {
		return { text: output, truncated: false };
	}
	return { text: lines.slice(0, OUTPUT_LINE_CAP).join("\n"), truncated: true };
}

/** First informative line of a failing report's output. */
function failureReason(output: string): string {
	const lines = output.split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed === "") {
			continue;
		}
		if (/panicked at/i.test(trimmed) || /\berror\b/i.test(trimmed)) {
			return trimmed;
		}
	}
	for (let i = lines.length - 1; i >= 0; i -= 1) {
		const trimmed = lines[i].trim();
		if (trimmed !== "") {
			return trimmed;
		}
	}
	return "";
}

/** The status dot of a row: no result yet, a pass, or a failure. */
function dotClass(result: TestReport | undefined): string {
	if (result === undefined) {
		return "test-dot";
	}
	return result.passed ? "test-dot pass" : "test-dot fail";
}

type TestRowProps = {
	item: TestItem;
	result: TestReport | undefined;
	running: boolean;
	highlighted: boolean;
	onRun: (name: string) => void;
};

function TestRow({ item, result, running, highlighted, onRun }: TestRowProps) {
	const [expanded, setExpanded] = useState(false);
	const [copyNote, setCopyNote] = useState<string | null>(null);
	const { module, leaf } = splitName(item.name);
	const failed = result !== undefined && !result.passed;

	const copy = async () => {
		if (result === undefined) {
			return;
		}
		try {
			if (navigator.clipboard === undefined) {
				throw new Error("clipboard unavailable");
			}
			await navigator.clipboard.writeText(result.output);
			setCopyNote("copied");
		} catch (error) {
			setCopyNote(error instanceof Error ? error.message : "copy failed");
		}
	};

	const duration =
		result === undefined
			? ""
			: result.durationMs >= 1000
				? `${(result.durationMs / 1000).toFixed(1)} s`
				: `${result.durationMs} ms`;

	const reason = result === undefined || result.passed ? "" : failureReason(result.output);

	return (
		<li className={highlighted ? "tests-item highlighted" : "tests-item"}>
			<div className="tests-row">
				<span className={dotClass(result)} aria-hidden="true" />
				<span className="test-name" title={item.name}>
					{module === "" ? null : <span className="test-module">{module}</span>}
					<span className="test-leaf">{leaf}</span>
				</span>
				<span className="test-duration">{duration}</span>
				{failed && reason !== "" ? <span className="test-reason">{reason}</span> : null}
				{failed ? (
					<button
						type="button"
						className="test-toggle"
						aria-expanded={expanded}
						onClick={() => {
							setExpanded((current) => !current);
							setCopyNote(null);
						}}
					>
						output
					</button>
				) : null}
				<button
					type="button"
					className={running ? "test-run running" : "test-run"}
					disabled={running}
					title={running ? "running" : `run ${item.name}`}
					onClick={() => onRun(item.name)}
				>
					{running ? RUNNING_GLYPH : "run"}
				</button>
			</div>
			{failed && expanded && result !== undefined ? (
				<div className="test-output-block">
					<div className="test-output-head">
						<span className="test-output-label">output</span>
						<button type="button" className="test-copy" onClick={() => void copy()}>
							copy
						</button>
						{copyNote === null ? null : (
							<span className="test-copy-note">{copyNote}</span>
						)}
					</div>
					<TestOutput output={result.output} />
				</div>
			) : null}
		</li>
	);
}

/** The output block, cut to the line cap. */
function TestOutput({ output }: { output: string }) {
	const capped = capOutput(output);
	return (
		<>
			<pre className="test-output">{capped.text}</pre>
			{capped.truncated ? (
				<p className="test-output-more">first {OUTPUT_LINE_CAP} lines</p>
			) : null}
		</>
	);
}

/** The group list, or the one line that says why there is none. */
function TestGroups({
	groups,
	results,
	running,
	collapsedGroups,
	onToggleGroup,
	highlighted,
	onRun,
}: {
	groups: TestGroup[];
	results: ReadonlyMap<string, TestReport>;
	running: ReadonlySet<string>;
	collapsedGroups: ReadonlySet<string>;
	onToggleGroup: (binary: string) => void;
	highlighted: number;
	onRun: (name: string) => void;
}) {
	if (groups.length === 0) {
		return <p className="problems-empty">No tests found</p>;
	}
	let index = 0;
	return (
		<>
			{groups.map((group) => {
				const collapsed = collapsedGroups.has(group.binary);
				const startIndex = index;
				index += group.tests.length;
				return (
					<div key={group.binary} className="tests-group">
						<div className="tests-group-head">
							<button
								type="button"
								className="tests-group-toggle"
								aria-expanded={!collapsed}
								onClick={() => onToggleGroup(group.binary)}
							>
								<span
									className={collapsed ? "tests-caret" : "tests-caret open"}
									aria-hidden="true"
								/>
								<span className="tests-binary" title={group.binary}>
									{group.binary}
								</span>
							</button>
							<span className="tests-group-count">{group.tests.length}</span>
						</div>
						{collapsed ? null : (
							<ul className="tests-list">
								{group.tests.map((item, i) => (
									<TestRow
										key={`${group.binary}::${item.name}`}
										item={item}
										result={results.get(item.name)}
										running={running.has(item.name)}
										highlighted={highlighted === startIndex + i}
										onRun={onRun}
									/>
								))}
							</ul>
						)}
					</div>
				);
			})}
		</>
	);
}

/**
 * The test list, grouped by binary. It renders only what the controller holds; the app owns the
 * runs themselves.
 */
export default function TestsPanel({
	items,
	loading,
	loadError,
	results,
	running,
	summary,
	collapsedGroups,
	onToggleGroup,
	highlighted,
	onRun,
}: TestsPanelProps) {
	const groups = groupByBinary(items);
	const summaryClass = summary?.includes("stopped at") ? " bad" : "";

	return (
		<div className="tests">
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
				/>
			)}
		</div>
	);
}
