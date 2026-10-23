import { useState } from "react";
import type { TestItem, TestReport } from "@/lib/project/api";
import { dotClass, failureReason, RUNNING_GLYPH, splitName } from "./parts";
import { TestOutput } from "./TestOutput";

export type TestRowProps = {
	item: TestItem;
	result: TestReport | undefined;
	running: boolean;
	highlighted: boolean;
	onRun: (name: string) => void;
};

export function TestRow({ item, result, running, highlighted, onRun }: TestRowProps) {
	const [expanded, setExpanded] = useState(false);
	const [copyNote, setCopyNote] = useState<string | null>(null);
	const { module, leaf } = splitName(item.name);
	const failed = result !== undefined && !result.passed;

	const copyOutput = async (event: { stopPropagation: () => void }) => {
		event.stopPropagation();
		if (result === undefined) {
			return;
		}
		try {
			if (navigator.clipboard === undefined) {
				throw new Error("clipboard unavailable");
			}
			await navigator.clipboard.writeText(result.output);
			setCopyNote("Copied");
			window.setTimeout(() => setCopyNote(null), 2000);
		} catch (error) {
			setCopyNote(error instanceof Error ? error.message : "copy failed");
		}
	};

	const copyName = async (event: { stopPropagation: () => void }) => {
		event.stopPropagation();
		try {
			if (navigator.clipboard === undefined) {
				throw new Error("clipboard unavailable");
			}
			await navigator.clipboard.writeText(item.name);
			setCopyNote("Copied");
			window.setTimeout(() => setCopyNote(null), 2000);
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
				<button
					type="button"
					className="test-copy-name"
					title={`copy ${item.name}`}
					onClick={(event) => void copyName(event)}
				>
					copy name
				</button>
				{failed ? (
					<button
						type="button"
						className="test-toggle"
						aria-expanded={expanded}
						onClick={(event) => {
							event.stopPropagation();
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
					onClick={(event) => {
						event.stopPropagation();
						onRun(item.name);
					}}
				>
					{running ? RUNNING_GLYPH : "run"}
				</button>
			</div>
			{failed && expanded && result !== undefined ? (
				<div className="test-output-block">
					<div className="test-output-head">
						<span className="test-output-label">output</span>
						<button
							type="button"
							className="test-copy"
							onClick={(event) => void copyOutput(event)}
						>
							copy output
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
