import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import {
	onPtyExited,
	onPtyOutput,
	type PtyExitedEvent,
	type PtyOutputEvent,
} from "@/lib/project/api";
import type { PtyBuffer } from "@/lib/terminal/ptyBuffer";
import { withChunk } from "@/lib/terminal/ptyBuffer";
import { appendData, type RawOutputHandler, type Session } from "@/lib/terminal/sessions";

/** A promise that settles once the PTY listeners are attached, whichever way that went. */
export function ptyGate(): { promise: Promise<void>; open: () => void } {
	let open: () => void = () => undefined;
	const promise = new Promise<void>((done) => {
		open = done;
	});
	return { promise, open: () => open() };
}

/**
 * One listener pair for every session; the PTY id is the key.
 *
 * Output that beats its session's `ptyId` assignment is buffered for the replay instead of being
 * dropped, and the gate settles on a failed subscription too.
 */
export function usePtyEvents(options: {
	buffer: PtyBuffer;
	sessionsRef: RefObject<Session[]>;
	rawHandlers: RefObject<Set<RawOutputHandler>>;
	setSessions: Dispatch<SetStateAction<Session[]>>;
	listeners: { promise: Promise<void>; open: () => void };
}) {
	const { buffer, sessionsRef, rawHandlers, setSessions, listeners } = options;
	// biome-ignore lint/correctness/useExhaustiveDependencies: the two refs and the state setter are stable; the buffer and the gate define the subscription.
	useEffect(() => {
		let unOutput: (() => void) | undefined;
		let unExited: (() => void) | undefined;
		let cancelled = false;
		void (async () => {
			try {
				unOutput = await onPtyOutput((event: PtyOutputEvent) => {
					for (const handler of rawHandlers.current) handler(event.id, event.data);
					if (!sessionsRef.current.some((s) => s.ptyId === event.id)) {
						buffer.push(event.id, event.data);
						return;
					}
					setSessions((current) =>
						current.map((s) => (s.ptyId !== event.id ? s : withChunk(s, event.data))),
					);
				});
				unExited = await onPtyExited((event: PtyExitedEvent) => {
					setSessions((current) =>
						current.map((s) => {
							if (s.ptyId !== event.id) return s;
							const next = appendData(s, `\nexited with code ${event.code ?? 0}`);
							return { ...next, exited: event.code };
						}),
					);
				});
			} catch {
				/* the panel already reports a failed open */
			}
			if (cancelled) {
				unOutput?.();
				unExited?.();
			}
			listeners.open();
		})();
		return () => {
			cancelled = true;
			unOutput?.();
			unExited?.();
		};
	}, [buffer, listeners]);
}
