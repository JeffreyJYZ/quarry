import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ptyClose, ptyOpen, ptyWrite } from "@/lib/project/api";
import { applyChunks, PtyBuffer } from "@/lib/terminal/ptyBuffer";
import {
	describe,
	emptySession,
	ptySize,
	type RawOutputHandler,
	type Session,
} from "@/lib/terminal/sessions";
import { parentDir } from "@/lib/project/paths";
import { ptyGate, usePtyEvents } from "@/ui/terminal/usePtyEvents";
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
	/** The root this session set belongs to, so a project switch is told apart from a re-render. */
	const rootRef = useRef(root);
	/** The newest `openSession`, so the root effect opens a tab without taking it as a dependency. */
	const openSessionRef = useRef<() => Promise<void>>(async () => undefined);
	/** Output that beats its session's `ptyId` assignment; replayed below, never dropped. */
	const [buffer] = useState(() => new PtyBuffer());
	const listeners = useMemo(ptyGate, []);
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
		const cwd =
			activePath !== null && activePath !== undefined
				? (parentDir(activePath) ?? root)
				: root;
		setSessions((current) => {
			// The ref the open guard reads must already hold the row, before React renders it.
			const next = [...current, emptySession(id, cwd, defaultFontSize)];
			sessionsRef.current = next;
			return next;
		});
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
	// The root effect reads this, so a project switch opens a tab through the newest closure.
	useEffect(() => {
		openSessionRef.current = openSession;
	}, [openSession]);
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
	// One listener pair for every session, wired outside this file so the session bookkeeping stays
	// readable.
	usePtyEvents({ buffer, sessionsRef, rawHandlers, setSessions, listeners });
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
	// Shells belong to the project they were opened in: a root change tears the old ones down and
	// opens a tab in the new root, and unmounting closes them too rather than leaving them running.
	useEffect(() => {
		if (rootRef.current !== root) {
			rootRef.current = root;
			sessionsRef.current = [];
			setSessions([]);
			setActiveId(null);
			void openSessionRef.current();
		}
		return () => {
			for (const s of sessionsRef.current) {
				if (s.ptyId !== null) {
					void ptyClose(s.ptyId).catch(() => undefined);
				}
			}
		};
	}, [root]);
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
