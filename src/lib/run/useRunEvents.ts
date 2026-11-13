import { useEffect } from "react";
import { onRunExited, onRunOutput } from "@/lib/project/api";
import type { ExitedEvent, OutputEvent, PendingEvent } from "@/lib/run/runOutput";

/**
 * One subscription to the backend's run events, for the lifetime of the console that owns it.
 *
 * The backend emits for every run it has ever started, so an event is handed on only for the run
 * the console currently owns. Anything else is held while a start command is in flight, because
 * that is the window where the run id is not known yet: a program that prints and exits at once
 * beats the command's answer back, and keeping that output is what stops a quick run from showing
 * a blank console. The start filters the buffer for its own run, so an older run's tail is dropped
 * rather than replayed into the new run's log.
 */
export function useRunEvents(options: {
	runningRef: { current: string | null };
	startingRef: { current: boolean };
	pendingRef: { current: PendingEvent[] };
	onOutput: (event: OutputEvent) => void;
	onExited: (event: ExitedEvent) => void;
}): void {
	const { runningRef, startingRef, pendingRef, onOutput, onExited } = options;

	useEffect(() => {
		let unOutput: (() => void) | undefined;
		let unExited: (() => void) | undefined;
		let cancelled = false;
		void (async () => {
			try {
				unOutput = await onRunOutput((event) => {
					if (event.runId === runningRef.current) {
						onOutput(event);
						return;
					}
					if (startingRef.current) pendingRef.current.push({ kind: "output", event });
				});
				unExited = await onRunExited((event) => {
					if (event.runId === runningRef.current) {
						onExited(event);
						return;
					}
					if (startingRef.current) pendingRef.current.push({ kind: "exited", event });
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
	}, [runningRef, startingRef, pendingRef, onOutput, onExited]);
}
