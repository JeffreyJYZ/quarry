import { useEffect, useRef } from "react";

export type RunLine = { stream: "stdout" | "stderr"; line: string };

export type RunLogProps = {
	lines: RunLine[];
	exited: { code: number | null; killed?: boolean } | null;
	onClear: () => void;
};

export default function RunLog({ lines, exited, onClear }: RunLogProps) {
	const ref = useRef<HTMLDivElement | null>(null);
	const stickRef = useRef(true);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll trigger depends on line count and exit state
	useEffect(() => {
		const el = ref.current;
		if (el === null) {
			return;
		}
		if (stickRef.current) {
			el.scrollTop = el.scrollHeight;
		}
	}, [lines.length, exited]);

	const onScroll = () => {
		const el = ref.current;
		if (el === null) {
			return;
		}
		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
		stickRef.current = atBottom;
	};

	const exitText =
		exited === null
			? null
			: exited.killed === true || exited.code === null
				? "killed"
				: `exited with code ${exited.code}`;

	return (
		<section className="run-log" aria-label="Run output">
			<div className="run-log-head">
				<span className="label">run</span>
				<button type="button" className="dock-action" onClick={onClear}>
					Clear
				</button>
			</div>
			<div ref={ref} className="run-log-body" onScroll={onScroll}>
				{lines.map((entry) => (
					<div
						key={`${entry.stream}-${entry.line}`}
						className={entry.stream === "stderr" ? "run-line stderr" : "run-line"}
					>
						{entry.line}
					</div>
				))}
				{exitText === null ? null : <div className="run-exit">{exitText}</div>}
			</div>
		</section>
	);
}
