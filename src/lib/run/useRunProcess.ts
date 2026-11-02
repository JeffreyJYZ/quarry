import { useCallback, useEffect, useRef, useState } from "react";
import { type EnvVar, onRunExited, onRunOutput, runProgram, stopProgram } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { RunLine } from "@/ui/run/RunLog";

export type RunExit = { code: number | null; killed?: boolean };

/** How many output lines a run keeps before the oldest are dropped. */
const MAX_LINES = 2000;

/** Append one line, dropping the oldest once the console is at its cap. */
function withLine(
	current: RunLine[],
	id: number,
	stream: RunLine["stream"],
	line: string,
): RunLine[] {
	const next = [...current, { id, stream, line }];
	return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
}

/**
 * One child process and its console.
 *
 * It owns the run id, the output lines and the exit, so two callers can start a process — the Run
 * form's validated fields and a detected target's resolved configuration — without either one
 * owning the log. Listeners are registered once for the hook's lifetime and filtered by run id,
 * because the backend emits for every run it has ever started.
 */
export function useRunProcess(onNotice: (message: string) => void): {
	running: string | null;
	lines: RunLine[];
	exited: RunExit | null;
	start: (program: string, args: string[], cwd: string, env: EnvVar[]) => Promise<boolean>;
	stop: () => Promise<void>;
	clear: () => void;
	/** Write lines the process never printed, such as why it could not be started. */
	append: (lines: string[]) => void;
} {
	const [running, setRunning] = useState<string | null>(null);
	const [lines, setLines] = useState<RunLine[]>([]);
	const [exited, setExited] = useState<RunExit | null>(null);

	const runningRef = useRef<string | null>(null);
	useEffect(() => {
		runningRef.current = running;
	}, [running]);

	// A line's identity, so two identical lines are two rows rather than one.
	const nextLineId = useRef(0);

	useEffect(() => {
		let unOutput: (() => void) | undefined;
		let unExited: (() => void) | undefined;
		let cancelled = false;
		void (async () => {
			try {
				unOutput = await onRunOutput((event) => {
					if (event.runId !== runningRef.current) return;
					setLines((current) => {
						nextLineId.current += 1;
						return withLine(current, nextLineId.current, event.stream, event.line);
					});
				});
				unExited = await onRunExited((event) => {
					if (event.runId !== runningRef.current) return;
					setExited({ code: event.code });
					setRunning(null);
				});
			} catch {
				/* a listener that never registered leaves the log to the next run */
			}
			if (cancelled) {
				unOutput?.();
				unExited?.();
			}
		})();
		return () => {
			cancelled = true;
			unOutput?.();
			unExited?.();
		};
	}, []);

	const start = useCallback(
		async (program: string, args: string[], cwd: string, env: EnvVar[]): Promise<boolean> => {
			setLines([]);
			setExited(null);
			runningRef.current = null;
			try {
				const id = await runProgram(program, args, cwd, env.length === 0 ? undefined : env);
				runningRef.current = id;
				setRunning(id);
				return true;
			} catch (error) {
				runningRef.current = null;
				setRunning(null);
				// The console is where a failed run is read; a toast is gone before it can be copied.
				setLines((current) => {
					nextLineId.current += 1;
					return withLine(
						current,
						nextLineId.current,
						"stderr",
						`cannot start ${program}: ${describeError(error)}`,
					);
				});
				return false;
			}
		},
		[],
	);

	/** Lines the process never printed: a build that stopped the launch, and why. */
	const append = useCallback((messages: string[]) => {
		if (messages.length === 0) return;
		setLines((current) => {
			let next = current;
			for (const message of messages) {
				nextLineId.current += 1;
				next = withLine(next, nextLineId.current, "stderr", message);
			}
			return next;
		});
	}, []);

	const stop = useCallback(async () => {
		const id = running;
		if (id === null) return;
		runningRef.current = null;
		setRunning(null);
		setExited((current) => (current === null ? { code: null, killed: true } : current));
		try {
			await stopProgram(id);
		} catch (error) {
			onNotice(describeError(error));
		}
	}, [running, onNotice]);

	const clear = useCallback(() => {
		setLines([]);
		setExited(null);
	}, []);

	return { running, lines, exited, start, stop, clear, append };
}
