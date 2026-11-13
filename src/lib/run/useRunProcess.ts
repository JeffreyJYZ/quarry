import { useCallback, useRef, useState } from "react";
import { type EnvVar, runProgram, sendRunStdin, stopProgram } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { RunLine, RunExit } from "@/lib/run/runOutput";
import {
	appendNotice,
	appendOutput,
	bufferedFor,
	type OutputEvent,
	type PendingEvent,
} from "@/lib/run/runOutput";
import { useRunEvents } from "@/lib/run/useRunEvents";

export type { RunExit } from "@/lib/run/runOutput";

/**
 * One child process and its console.
 *
 * It owns the run id, the output lines and the exit, so two callers can start a process — the Run
 * form's validated fields and a detected target's resolved configuration — without either one
 * owning the log. Listeners are registered once for the hook's lifetime and filtered by run id,
 * because the backend emits for every run it has ever started.
 *
 * One run at a time: a second start is refused while a child is live, because the backend keeps
 * every process it started and a new run would orphan the old one's output and its process.
 */
export function useRunProcess(onNotice: (message: string) => void): {
	running: string | null;
	/** Stop was sent and the backend has not reported the exit yet. */
	stopping: boolean;
	lines: RunLine[];
	exited: RunExit | null;
	/** False only when the program could not be started; a run already live is left alone. */
	start: (program: string, args: string[], cwd: string, env: EnvVar[]) => Promise<boolean>;
	stop: () => Promise<void>;
	clear: () => void;
	/** One line to the live program's stdin; a refusal is written into the console. */
	sendStdin: (text: string) => Promise<void>;
	/** Write lines the process never printed: with no run live, a fresh console for that attempt. */
	append: (lines: string[]) => void;
} {
	const [running, setRunning] = useState<string | null>(null);
	const [stopping, setStopping] = useState(false);
	const [lines, setLines] = useState<RunLine[]>([]);
	const [exited, setExited] = useState<RunExit | null>(null);

	const runningRef = useRef<string | null>(null);
	/** A start is in flight: the run id is not known yet, so its events must not be dropped. */
	const startingRef = useRef(false);
	/** The run the user asked to stop, so its exit reads "stopped" and not "terminated". */
	const stopRequestedRef = useRef<string | null>(null);
	/** Events that arrived before the command answered, held for the run that is starting. */
	const pendingRef = useRef<PendingEvent[]>([]);

	/** The backend's exit is the only source of the exit status; the stop only annotates it. */
	const finish = useCallback(
		(event: { runId: string; code: number | null; signal: number | null }) => {
			const killed = stopRequestedRef.current === event.runId;
			runningRef.current = null;
			stopRequestedRef.current = null;
			setRunning(null);
			setStopping(false);
			setExited({ code: event.code, signal: event.signal, killed });
		},
		[],
	);

	/** Replay what arrived while the command was in flight, in the order it was emitted. */
	const flush = useCallback(
		(id: string) => {
			const buffered = bufferedFor(pendingRef.current, id);
			pendingRef.current = [];
			const output = buffered.flatMap((entry) =>
				entry.kind === "output" ? [entry.event] : [],
			);
			if (output.length > 0) {
				setLines((current) =>
					output.reduce((next, event) => appendOutput(next, event), current),
				);
			}
			for (const entry of buffered) {
				if (entry.kind === "exited") finish(entry.event);
			}
		},
		[finish],
	);

	/** A new attempt owns the console: no rows, no exit, none of an older run's held tail. */
	const beginAttempt = useCallback(() => {
		pendingRef.current = [];
		stopRequestedRef.current = null;
		setStopping(false);
		setLines([]);
		setExited(null);
	}, []);

	/** One chunk of the run the console owns. */
	const appendOne = useCallback((event: OutputEvent) => {
		setLines((current) => appendOutput(current, event));
	}, []);

	useRunEvents({
		runningRef,
		startingRef,
		pendingRef,
		onOutput: appendOne,
		onExited: finish,
	});

	const start = useCallback(
		async (program: string, args: string[], cwd: string, env: EnvVar[]): Promise<boolean> => {
			// One child at a time, including two starts racing inside the same tick: the guard has to
			// read the refs, because `running` only updates once the command has answered. A request
			// that arrives while a run is live is not a failure, so the caller must not report one.
			if (runningRef.current !== null || startingRef.current) return true;
			startingRef.current = true;
			beginAttempt();
			try {
				const id = await runProgram(program, args, cwd, env.length === 0 ? undefined : env);
				runningRef.current = id;
				flush(id);
				// A program that exits inside the command's round trip has already reported its exit,
				// and flushing that cleared the run: it must not be made live again.
				if (runningRef.current === id) setRunning(id);
				return true;
			} catch (error) {
				// The console is where a failed run is read; a toast is gone before it can be copied.
				setLines((current) =>
					appendNotice(current, [`cannot start ${program}: ${describeError(error)}`]),
				);
				return false;
			} finally {
				startingRef.current = false;
				if (runningRef.current === null) pendingRef.current = [];
			}
		},
		[beginAttempt, flush],
	);

	/**
	 * Lines the process never printed: a build that stopped the launch, and why.
	 *
	 * A failed build is an attempt with no process, so it owns the console as `start` does and the
	 * previous run's output cannot sit above it. A live run keeps its log: that attempt was refused,
	 * and the reason belongs under the output the user is watching.
	 */
	const append = useCallback(
		(messages: string[]) => {
			if (messages.length === 0) return;
			if (runningRef.current !== null || startingRef.current) {
				setLines((current) => appendNotice(current, messages));
				return;
			}
			beginAttempt();
			setLines(appendNotice([], messages));
		},
		[beginAttempt],
	);

	const stop = useCallback(async () => {
		const id = runningRef.current;
		if (id === null) return;
		stopRequestedRef.current = id;
		setStopping(true);
		try {
			await stopProgram(id);
		} catch (error) {
			// A stop that never reached the backend leaves the run live, and the panel must say so.
			stopRequestedRef.current = null;
			setStopping(false);
			onNotice(describeError(error));
		}
	}, [onNotice]);

	const clear = useCallback(() => {
		setLines([]);
		setExited(null);
	}, []);

	/** The console keeps a refused line: a program that exited between the keypress and the send is
	 * only visible there, and a toast is gone before it can be copied. */
	const sendStdin = useCallback(async (text: string) => {
		const id = runningRef.current;
		if (id === null) return;
		try {
			await sendRunStdin(id, text);
		} catch (error) {
			setLines((current) =>
				appendNotice(current, [`cannot send input: ${describeError(error)}`]),
			);
		}
	}, []);

	return { running, stopping, lines, exited, start, stop, clear, sendStdin, append };
}
