import { useCallback, useEffect, useRef, useState } from "react";
import { type EnvVar, onRunExited, onRunOutput, runProgram, stopProgram } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { RunLine } from "@/ui/run/RunLog";

export type RunExit = { code: number | null; killed?: boolean };

/** How many output lines a run keeps before the oldest are dropped. */
const MAX_LINES = 2000;

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
	start: (program: string, args: string[], cwd: string, env: EnvVar[]) => Promise<void>;
	stop: () => Promise<void>;
	clear: () => void;
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
						const next = [
							...current,
							{
								id: nextLineId.current,
								stream: event.stream,
								line: event.line,
							},
						];
						return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
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
		async (program: string, args: string[], cwd: string, env: EnvVar[]) => {
			setLines([]);
			setExited(null);
			try {
				const id = await runProgram(program, args, cwd, env.length === 0 ? undefined : env);
				setRunning(id);
			} catch (error) {
				onNotice(describeError(error));
			}
		},
		[onNotice],
	);

	const stop = useCallback(async () => {
		const id = running;
		if (id === null) return;
		try {
			await stopProgram(id);
		} catch (error) {
			onNotice(describeError(error));
		}
		setExited((current) => (current === null ? { code: null, killed: true } : current));
		setRunning(null);
	}, [running, onNotice]);

	const clear = useCallback(() => {
		setLines([]);
		setExited(null);
	}, []);

	return { running, lines, exited, start, stop, clear };
}
