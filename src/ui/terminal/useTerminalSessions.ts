import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	onPtyExited,
	onPtyOutput,
	type PtyExitedEvent,
	type PtyOutputEvent,
	ptyClose,
	ptyOpen,
	ptyWrite,
} from "@/lib/project/api";
import { applyChunks, PtyBuffer, withChunk } from "@/lib/terminal/ptyBuffer";
import {
	appendData,
	describe,
	dirOf,
	emptySession,
	ptySize,
	type Session,
} from "@/lib/terminal/sessions";
/** A raw PTY chunk, for a renderer that needs bytes rather than the parsed line model. */
export type RawOutputHandler = (ptyId: string, data: string) => void;
/** A promise that settles once the PTY listeners are attached, whichever way that went. */
function gate(): { promise: Promise<void>; open: () => void } {
	let open: () => void = () => undefined;
	const promise = new Promise<void>((done) => {
		open = done;
	});
	return { promise, open: () => open() };
}
/** The terminal's sessions: one PTY each, plus the global event wiring. It owns nothing visual. */
export function useTerminalSessions(options: {
	root: string;
	activePath: string | null | undefined;
	defaultFontSize: number | undefined;
	containerRef: React.RefObject<HTMLDivElement | null>;
	onNotice?: (message: string) => void;
}) {
	const { root, activePath, defaultFontSize, containerRef, onNotice } = options;
	const writeFailed = useRef<Set<number>>(new Set());
	const [sessions, setSessions] = useState<Session[]>([]);
	const [activeId, setActiveId] = useState<number | null>(null);
	const nextId = useRef(1);
	const sessionsRef = useRef<Session[]>([]);
	const activeIdRef = useRef<number | null>(null);
	/** Output that beats its session's `ptyId` assignment; replayed below, never dropped. */
	const [buffer] = useState(() => new PtyBuffer());
	const listeners = useMemo(gate, []);
	const rawHandlers = useRef<Set<RawOutputHandler>>(new Set());
	const subscribeRaw = useCallback((handler: RawOutputHandler) => {
		rawHandlers.current.add(handler);
		return () => void rawHandlers.current.delete(handler);
	}, []);
	useEffect(() => {
		sessionsRef.current = sessions;
		activeIdRef.current = activeId;
	}, [sessions, activeId]);
	const updateSession = useCallback((id: number, updater: (s: Session) => Session) => {
		setSessions((current) => current.map((s) => (s.id === id ? updater(s) : s)));
	}, []);
	const openSession = useCallback(async () => {
		const id = nextId.current;
		nextId.current += 1;
		const cwd = activePath !== null && activePath !== undefined ? dirOf(activePath) : root;
		setSessions((current) => [...current, emptySession(id, cwd, defaultFontSize)]);
		setActiveId(id);
		// The prompt lands milliseconds after `pty_open`, so its listeners must exist first. The gate
		// settles on a failed subscription too.
		await listeners.promise;
		try {
			const { rows, cols } = ptySize(containerRef.current);
			const result = await ptyOpen(cwd, rows, cols);
			if (sessionsRef.current.find((s) => s.id === id) === undefined) {
				buffer.discard(result.id);
				void ptyClose(result.id).catch(() => undefined);
				return;
			}
			updateSession(id, (s) => ({
				...s,
				ptyId: result.id,
				pid: result.pid,
				opening: false,
			}));
		} catch (err) {
			updateSession(id, (s) => ({
				...s,
				error: `Terminal unavailable: ${describe(err)}`,
				opening: false,
			}));
		}
	}, [root, activePath, updateSession, defaultFontSize, containerRef, buffer, listeners]);
	const closeSession = useCallback(
		(id: number) => {
			const session = sessionsRef.current.find((s) => s.id === id);
			if (session !== undefined && session.ptyId !== null) {
				buffer.discard(session.ptyId);
				void ptyClose(session.ptyId).catch(() => undefined);
			}
			setSessions((current) => {
				const remaining = current.filter((s) => s.id !== id);
				if (activeIdRef.current === id) {
					const idx = current.findIndex((s) => s.id === id);
					const neighbour = remaining[idx] ?? remaining[idx - 1] ?? null;
					setActiveId(neighbour ? neighbour.id : null);
				}
				return remaining;
			});
		},
		[buffer],
	);
	// One listener pair for every session; the PTY id is the key.
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
	// A claimed PTY owns the handshake output; the replay restarts this effect for a late chunk.
	useEffect(() => {
		for (const session of sessions) {
			const ptyId = session.ptyId;
			if (ptyId === null || !buffer.has(ptyId)) continue;
			const pending = buffer.take(ptyId);
			updateSession(session.id, (s) => applyChunks(s, pending));
			for (const handler of rawHandlers.current)
				for (const data of pending) handler(ptyId, data);
		}
	}, [sessions, buffer, updateSession]);
	// Closing the panel must not leave shells running in the background.
	useEffect(() => {
		return () => {
			for (const s of sessionsRef.current) {
				if (s.ptyId !== null) {
					void ptyClose(s.ptyId).catch(() => undefined);
				}
			}
		};
	}, []);
	const send = useCallback(
		(data: string) => {
			const session = sessionsRef.current.find((s) => s.id === activeIdRef.current);
			if (session?.ptyId === null || session?.ptyId === undefined) return;
			void ptyWrite(session.ptyId, data).catch((err) => {
				if (!writeFailed.current.has(session.id)) {
					writeFailed.current.add(session.id);
					onNotice?.(`terminal write failed: ${describe(err)}`);
				}
			});
		},
		[onNotice],
	);
	return {
		sessions,
		activeId,
		setActiveId,
		sessionsRef,
		activeIdRef,
		updateSession,
		openSession,
		closeSession,
		send,
		setSessions,
		subscribeRaw,
	};
}
