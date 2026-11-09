import { useEffect, useRef, useState } from "react";
import { exitStatusText } from "@/lib/run/exitStatus";
import { sticksToBottom } from "@/lib/run/stick";
import { TOAST_MS } from "@/lib/consts/tests";
import type { RunExit, RunLine } from "@/lib/run/runOutput";
import { copyText, lineClass, stopLabel } from "@/ui/run/view";
import RunInputRow from "@/ui/run/RunInputRow";

export type { RunLine } from "@/lib/run/runOutput";

export type RunLogProps = {
	lines: RunLine[];
	exited: RunExit | null;
	onClear: () => void;
	argv: string;
	cwd?: string;
	running: boolean;
	/** Stop was sent and the process has not reported its exit yet. */
	stopping: boolean;
	onStop: () => void;
	onRerun: () => void;
	/** One line to the running program, sent when Enter is pressed in the input row. */
	onStdin: (text: string) => void;
};

export default function RunLog({
	lines,
	exited,
	onClear,
	argv,
	cwd,
	running,
	stopping,
	onStop,
	onRerun,
	onStdin,
}: RunLogProps) {
	const ref = useRef<HTMLDivElement | null>(null);
	const stickRef = useRef(true);
	const [copyStatus, setCopyStatus] = useState<string | null>(null);
	const statusTimer = useRef<number | null>(null);
	const canSend = running && !stopping;

	// Follow the newest line: `lines` is a new array on every append, so the cap on its length can
	// never stop the scroll from sticking to the bottom.
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll trigger depends on the line array and the exit state
	useEffect(() => {
		const el = ref.current;
		if (el === null) {
			return;
		}
		if (stickRef.current) {
			el.scrollTop = el.scrollHeight;
		}
	}, [lines, exited]);

	// The pane can change height without a scroll event — a splitter drag, a window resize, the dock
	// collapsing — and a stick flag computed for the old height snapped a reader who was just above
	// the bottom down on the next line. Recompute it against the geometry that is on screen now.
	useEffect(() => {
		const el = ref.current;
		if (el === null) {
			return;
		}
		const observer = new ResizeObserver(() => {
			stickRef.current = sticksToBottom(el);
			if (stickRef.current) {
				el.scrollTop = el.scrollHeight;
			}
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const onScroll = () => {
		const el = ref.current;
		if (el === null) {
			return;
		}
		stickRef.current = sticksToBottom(el);
	};

	const showStatus = (text: string) => {
		setCopyStatus(text);
		if (statusTimer.current !== null) {
			window.clearTimeout(statusTimer.current);
		}
		statusTimer.current = window.setTimeout(() => {
			statusTimer.current = null;
			setCopyStatus(null);
		}, TOAST_MS);
	};

	const copyOutput = async () => {
		const text = copyText(lines);
		try {
			if (navigator.clipboard === undefined) {
				throw new Error("clipboard unavailable");
			}
			await navigator.clipboard.writeText(text);
			showStatus("Copied");
		} catch (error) {
			showStatus(
				error instanceof Error
					? error.message
					: "Copy failed: could not copy to clipboard.",
			);
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
			showStatus(
				error instanceof Error
					? error.message
					: "Copy failed: could not copy to clipboard.",
			);
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
					<button
						type="button"
						className="dock-action"
						onClick={onStop}
						disabled={!running || stopping}
					>
						{stopLabel(stopping)}
					</button>
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
					<div key={entry.seq} className={lineClass(entry.stream)}>
						{entry.line}
					</div>
				))}
				{exitText === null ? null : <div className="run-exit">{exitText}</div>}
			</div>
			<RunInputRow canSend={canSend} onSend={onStdin} />
		</section>
	);
}
