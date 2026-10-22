import { useCallback, useEffect, useRef, useState } from "react";
import {
	onPtyExited,
	onPtyOutput,
	type PtyExitedEvent,
	type PtyOutputEvent,
	ptyClose,
	ptyOpen,
	ptyResize,
	ptyWrite,
} from "@/project/api";

const MAX_LINES = 4000;
const RESIZE_DEBOUNCE_MS = 120;

export type TerminalProps = {
	root: string;
};

type Session = {
	id: number;
	ptyId: string | null;
	lines: string[];
	dropped: number;
	exited: number | null;
	error: string | null;
	opening: boolean;
	stick: boolean;
};

function describe(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (typeof err === "string") return err;
	return String(err);
}

function appendData(prev: Session, data: string): Session {
	const next = [...prev.lines];
	const parts = data.split("\n");
	for (let i = 0; i < parts.length; i += 1) {
		if (i > 0) {
			next.push("");
		}
		const last = next.length - 1;
		if (last >= 0) {
			next[last] = (next[last] ?? "") + parts[i];
		} else {
			next.push(parts[i]);
		}
	}
	let dropped = prev.dropped;
	if (next.length > MAX_LINES) {
		const overflow = next.length - MAX_LINES;
		dropped += overflow;
		return { ...prev, lines: next.slice(next.length - MAX_LINES), dropped };
	}
	return { ...prev, lines: next, dropped };
}

export default function Terminal({ root }: TerminalProps) {
	const [sessions, setSessions] = useState<Session[]>([]);
	const [activeId, setActiveId] = useState<number | null>(null);
	const nextId = useRef(1);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	const resizeTimer = useRef<number | null>(null);
	const sessionsRef = useRef<Session[]>([]);
	const activeIdRef = useRef<number | null>(null);
	const listenersReady = useRef(false);

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
		const session: Session = {
			id,
			ptyId: null,
			lines: [],
			dropped: 0,
			exited: null,
			error: null,
			opening: true,
			stick: true,
		};
		setSessions((current) => [...current, session]);
		setActiveId(id);
		try {
			const el = containerRef.current;
			const width = el ? el.clientWidth : 800;
			const cols = Math.max(20, Math.floor(width / 8));
			const h = el ? el.clientHeight : 200;
			const rows = Math.max(8, Math.floor(h / 18));
			const ptyId = await ptyOpen(root, rows, cols);
			if (sessionsRef.current.find((s) => s.id === id) === undefined) {
				void ptyClose(ptyId).catch(() => undefined);
				return;
			}
			updateSession(id, (s) => ({ ...s, ptyId, opening: false }));
		} catch (err) {
			updateSession(id, (s) => ({
				...s,
				error: `Terminal unavailable: ${describe(err)}`,
				opening: false,
			}));
		}
	}, [root, updateSession]);

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

	// global listeners once
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
							return appendData(s, event.data);
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
				/* ignore */
			}
			if (cancelled) {
				unOutput?.();
				unExited?.();
			}
		})();
		listenersReady.current = true;
		return () => {
			cancelled = true;
			unOutput?.();
			unExited?.();
		};
	}, []);

	// close all on unmount
	useEffect(() => {
		return () => {
			for (const s of sessionsRef.current) {
				if (s.ptyId !== null) {
					void ptyClose(s.ptyId).catch(() => undefined);
				}
			}
		};
	}, []);

	// open first session on mount
	// biome-ignore lint/correctness/useExhaustiveDependencies: mount only
	useEffect(() => {
		void openSession();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// resize observer
	useEffect(() => {
		const el = containerRef.current;
		if (el === null) return;
		const schedule = () => {
			if (resizeTimer.current !== null) {
				window.clearTimeout(resizeTimer.current);
			}
			resizeTimer.current = window.setTimeout(() => {
				resizeTimer.current = null;
				const id = activeIdRef.current;
				const session = sessionsRef.current.find((s) => s.id === id);
				if (session?.ptyId === null || session?.ptyId === undefined) return;
				const cols = Math.max(20, Math.floor(el.clientWidth / 8));
				const rows = Math.max(8, Math.floor(el.clientHeight / 18));
				setSessions((current) =>
					current.map((s) => (s.id === id ? { ...s, stick: s.stick } : s)),
				);
				void ptyResize(session.ptyId, rows, cols).catch(() => undefined);
			}, RESIZE_DEBOUNCE_MS);
		};
		const ro = new ResizeObserver(() => schedule());
		ro.observe(el);
		return () => {
			ro.disconnect();
			if (resizeTimer.current !== null) {
				window.clearTimeout(resizeTimer.current);
				resizeTimer.current = null;
			}
		};
	}, []);

	// scroll stick
	useEffect(() => {
		const el = containerRef.current;
		if (el === null) return;
		const session = sessions.find((s) => s.id === activeId);
		if (session === null || session === undefined) return;
		if (session.stick) {
			el.scrollTop = el.scrollHeight;
		}
	}, [sessions, activeId]);

	const active = sessions.find((s) => s.id === activeId) ?? null;

	const send = useCallback((data: string) => {
		const session = sessionsRef.current.find((s) => s.id === activeIdRef.current);
		if (session?.ptyId === null || session?.ptyId === undefined) return;
		void ptyWrite(session.ptyId, data).catch(() => undefined);
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: restart reads sessions via closure
	const restart = useCallback(() => {
		if (activeId === null) return;
		const session = sessions.find((s) => s.id === activeId);
		if (session?.ptyId !== null && session?.ptyId !== undefined) {
			void ptyClose(session.ptyId).catch(() => undefined);
		}
		updateSession(activeId, (s) => ({
			...s,
			ptyId: null,
			lines: [],
			dropped: 0,
			exited: null,
			error: null,
			opening: true,
			stick: true,
		}));
		void (async () => {
			try {
				const el = containerRef.current;
				const width = el ? el.clientWidth : 800;
				const cols = Math.max(20, Math.floor(width / 8));
				const h = el ? el.clientHeight : 200;
				const rows = Math.max(8, Math.floor(h / 18));
				const ptyId = await ptyOpen(root, rows, cols);
				updateSession(activeId, (s) => ({ ...s, ptyId, opening: false }));
			} catch (err) {
				updateSession(activeId, (s) => ({
					...s,
					error: `Terminal unavailable: ${describe(err)}`,
					opening: false,
				}));
			}
		})();
	}, [active, activeId, root, updateSession]);

	// Cmd+T / Cmd+W inside terminal
	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey) return;
			const key = event.key.toLowerCase();
			if (key === "t") {
				event.preventDefault();
				void openSession();
			} else if (key === "w") {
				if (activeIdRef.current === null) return;
				event.preventDefault();
				closeSession(activeIdRef.current);
			}
		};
		window.addEventListener("keydown", handler, true);
		return () => window.removeEventListener("keydown", handler, true);
	}, [openSession, closeSession]);

	const onScroll = useCallback(() => {
		const el = containerRef.current;
		if (el === null || activeId === null) return;
		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
		updateSession(activeId, (s) => ({ ...s, stick: atBottom }));
	}, [activeId, updateSession]);

	const onKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (active === null) return;
			if (active.exited !== null && event.key === "Enter") {
				event.preventDefault();
				restart();
				return;
			}
			if (event.metaKey && (event.key === "k" || event.key === "K")) {
				event.preventDefault();
				event.stopPropagation();
				updateSession(active.id, (s) => ({ ...s, lines: [], dropped: 0 }));
				return;
			}
			if (event.metaKey && (event.key === "l" || event.key === "L")) {
				event.preventDefault();
				event.stopPropagation();
				send("\x0c");
				return;
			}
			if (event.metaKey && (event.key === "t" || event.key === "T")) {
				event.preventDefault();
				event.stopPropagation();
				void openSession();
				return;
			}
			if (event.metaKey && (event.key === "w" || event.key === "W")) {
				event.preventDefault();
				event.stopPropagation();
				closeSession(active.id);
				return;
			}
			if (event.metaKey && (event.key === "c" || event.key === "C")) {
				const selection = window.getSelection();
				if (selection !== null && selection.toString().length > 0) {
					event.preventDefault();
					void navigator.clipboard.writeText(selection.toString()).catch(() => undefined);
					return;
				}
			}
			if (event.ctrlKey && (event.key === "c" || event.key === "C")) {
				event.preventDefault();
				send("\x03");
				return;
			}
			if (event.metaKey && (event.key === "v" || event.key === "V")) {
				event.preventDefault();
				void navigator.clipboard
					.readText()
					.then((text) => {
						send(text);
					})
					.catch(() => undefined);
				return;
			}
			if (event.metaKey || event.ctrlKey || event.altKey) {
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				send("\r");
				return;
			}
			if (event.key === "Backspace") {
				event.preventDefault();
				send("\x7f");
				return;
			}
			if (event.key === "Tab") {
				event.preventDefault();
				send("\t");
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				send("\x1b[A");
				return;
			}
			if (event.key === "ArrowDown") {
				event.preventDefault();
				send("\x1b[B");
				return;
			}
			if (event.key === "ArrowRight") {
				event.preventDefault();
				send("\x1b[C");
				return;
			}
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				send("\x1b[D");
				return;
			}
			if (event.key.length === 1) {
				event.preventDefault();
				send(event.key);
			}
		},
		[active, send, restart, openSession, closeSession, updateSession],
	);

	const displayed: string[] =
		active === null
			? []
			: active.dropped > 0
				? [`… ${active.dropped} lines dropped`, ...active.lines]
				: active.lines;

	const size = { cols: 80, rows: 24 };

	return (
		<section className="terminal" aria-label="Terminal">
			<div className="terminal-tabs">
				{sessions.map((s, i) => (
					<button
						key={s.id}
						type="button"
						className={`terminal-tab${s.id === activeId ? " active" : ""}${s.exited !== null ? " exited" : ""}`}
						onClick={() => setActiveId(s.id)}
					>
						<span>{i + 1}</span>
						<button
							type="button"
							className="terminal-tab-close"
							onClick={(e) => {
								e.stopPropagation();
								closeSession(s.id);
							}}
						>
							×
						</button>
					</button>
				))}
				<button
					type="button"
					className="terminal-tab terminal-tab-add"
					onClick={() => void openSession()}
				>
					+
				</button>
			</div>
			<div className="terminal-head">
				<span className="label">terminal</span>
				<span className="terminal-shell">{root}</span>
				{active !== null ? (
					<>
						<span className="terminal-size">
							{size.cols}x{size.rows}
						</span>
						<button type="button" className="terminal-restart" onClick={restart}>
							Restart
						</button>
						{active.exited !== null ? (
							<span className="terminal-exit">exited {active.exited}</span>
						) : null}
					</>
				) : null}
			</div>
			{active === null ? (
				<div className="terminal-empty">
					<p>No terminal open.</p>
					<button
						type="button"
						className="terminal-restart"
						onClick={() => void openSession()}
					>
						New terminal
					</button>
				</div>
			) : active.error !== null ? (
				<div className="terminal-error">{active.error}</div>
			) : (
				<div ref={containerRef} className="terminal-body" onScroll={onScroll}>
					<pre className="terminal-pre">{displayed.join("\n")}</pre>
				</div>
			)}
			<textarea
				ref={inputRef}
				className="terminal-input"
				aria-label="Terminal input"
				value=""
				readOnly
				onKeyDown={onKeyDown}
			/>
		</section>
	);
}
