import { useEffect, useRef, useState } from "react";
import { exitStatusText } from "@/lib/run/exitStatus";

/** One console line; the id makes a repeated line a distinct row. */
export type RunLine = { id: number; stream: "stdout" | "stderr"; line: string };

export type RunLogProps = {
	lines: RunLine[];
	exited: { code: number | null; killed?: boolean } | null;
	onClear: () => void;
	argv: string;
	cwd?: string;
	running: boolean;
	onRerun: () => void;
};

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequences
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

function stripAnsi(text: string): string {
	return text.replace(ANSI_RE, "");
}

export default function RunLog({
	lines,
	exited,
	onClear,
	argv,
	cwd,
	running,
	onRerun,
}: RunLogProps) {
	const ref = useRef<HTMLDivElement | null>(null);
	const stickRef = useRef(true);
	const [copyStatus, setCopyStatus] = useState<string | null>(null);
	const statusTimer = useRef<number | null>(null);

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

	const showStatus = (text: string) => {
		setCopyStatus(text);
		if (statusTimer.current !== null) {
			window.clearTimeout(statusTimer.current);
		}
		statusTimer.current = window.setTimeout(() => {
			statusTimer.current = null;
			setCopyStatus(null);
		}, 2000);
	};

	const copyOutput = async () => {
		const text = lines.map((entry) => stripAnsi(entry.line)).join("\n");
		try {
			if (navigator.clipboard === undefined) {
				throw new Error("clipboard unavailable");
			}
			await navigator.clipboard.writeText(text);
			showStatus("Copied");
		} catch (error) {
			showStatus(error instanceof Error ? error.message : "copy failed");
		}
	};

	const copyArgv = async () => {
		try {
			if (navigator.clipboard === undefined) {
				throw new Error("clipboard unavailable");
			}
			await navigator.clipboard.writeText(argv);
			showStatus("Copied");
		} catch (error) {
			showStatus(error instanceof Error ? error.message : "copy failed");
		}
	};

	useEffect(
		() => () => {
			if (statusTimer.current !== null) {
				window.clearTimeout(statusTimer.current);
				statusTimer.current = null;
			}
		},
		[],
	);

	const exitText = exited === null ? null : exitStatusText(exited);

	return (
		<section className="run-log" aria-label="Run output">
			<div className="run-log-head">
				<span className="label">run</span>
				{cwd === undefined || cwd === "" ? null : (
					<span className="run-copy-status" title={cwd}>
						cwd {cwd}
					</span>
				)}
				{copyStatus === null ? null : <span className="run-copy-status">{copyStatus}</span>}
				<div className="run-log-actions">
					<button type="button" className="dock-action" onClick={() => void copyOutput()}>
						Copy output
					</button>
					<button type="button" className="dock-action" onClick={() => void copyArgv()}>
						Copy argv
					</button>
					<button
						type="button"
						className="dock-action"
						onClick={onRerun}
						disabled={running}
					>
						Re-run
					</button>
					<button type="button" className="dock-action" onClick={onClear}>
						Clear
					</button>
				</div>
			</div>
			<div ref={ref} className="run-log-body" onScroll={onScroll}>
				{lines.map((entry) => (
					<div
						key={entry.id}
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
