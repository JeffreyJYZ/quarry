import { useCallback, useEffect, useRef, useState } from "react";
import {
	onPtyExited,
	onPtyOutput,
	type PtyExitedEvent,
	type PtyOutputEvent,
	ptyClose,
	ptyOpen,
	ptyWrite,
} from "@/lib/project/api";
import { parseOsc7Cwd } from "@/lib/terminal/fontSize";
import {
	appendData,
	describe,
	dirOf,
	emptySession,
	ptySize,
	type Session,
} from "@/lib/terminal/sessions";

/**
 * The terminal's sessions: one PTY each, plus the global event wiring.
 *
 * The hook owns nothing visual; the panel decides how a session is drawn.
 */
export function useTerminalSessions(options: {
	root: string;
	activePath: string | null | undefined;
	defaultFontSize: number | undefined;
	containerRef: React.RefObject<HTMLDivElement | null>;
}) {
	const { root, activePath, defaultFontSize, containerRef } = options;
	const [sessions, setSessions] = useState<Session[]>([]);
	const [activeId, setActiveId] = useState<number | null>(null);
	const nextId = useRef(1);
	const sessionsRef = useRef<Session[]>([]);
	const activeIdRef = useRef<number | null>(null);

	useEffect(() => {
		sessionsRef.current = sessions;
	}, [sessions]);
	useEffect(() => {
		activeIdRef.current = activeId;
	}, [activeId]);

	const updateSession = useCallback((id: number, updater: (s: Session) => Session) => {
		setSessions((current) => current.map((s) => (s.id === id ? updater(s) : s)));
	}, []);

	const openSession = useCallback(async () => {
		const id = nextId.current;
		nextId.current += 1;
		const cwd = activePath !== null && activePath !== undefined ? dirOf(activePath) : root;
		setSessions((current) => [...current, emptySession(id, cwd, defaultFontSize)]);
		setActiveId(id);
		try {
			const { rows, cols } = ptySize(containerRef.current);
			const result = await ptyOpen(cwd, rows, cols);
			if (sessionsRef.current.find((s) => s.id === id) === undefined) {
				void ptyClose(result.id).catch(() => undefined);
				return;
			}
			updateSession(id, (s) => ({ ...s, ptyId: result.id, pid: result.pid, opening: false }));
		} catch (err) {
			updateSession(id, (s) => ({
				...s,
				error: `Terminal unavailable: ${describe(err)}`,
				opening: false,
			}));
		}
	}, [root, activePath, updateSession, defaultFontSize, containerRef]);

	const closeSession = useCallback((id: number) => {
		const session = sessionsRef.current.find((s) => s.id === id);
		if (session !== undefined && session.ptyId !== null) {
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
	}, []);

	// One listener pair for every session; the PTY id is the key.
	useEffect(() => {
		let unOutput: (() => void) | undefined;
		let unExited: (() => void) | undefined;
		let cancelled = false;
		void (async () => {
			try {
				unOutput = await onPtyOutput((event: PtyOutputEvent) => {
					setSessions((current) =>
						current.map((s) => {
							if (s.ptyId !== event.id) return s;
							const next = appendData(s, event.data);
							const cwd = parseOsc7Cwd(event.data);
							return cwd === null ? next : { ...next, cwd };
						}),
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
		})();
		return () => {
			cancelled = true;
			unOutput?.();
			unExited?.();
		};
	}, []);

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

	const send = useCallback((data: string) => {
		const session = sessionsRef.current.find((s) => s.id === activeIdRef.current);
		if (session?.ptyId === null || session?.ptyId === undefined) return;
		void ptyWrite(session.ptyId, data).catch(() => undefined);
	}, []);

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
	};
}
