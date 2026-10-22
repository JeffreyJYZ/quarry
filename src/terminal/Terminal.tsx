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

export default function Terminal({ root }: TerminalProps) {
	const [lines, setLines] = useState<string[]>([]);
	const [dropped, setDropped] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [exited, setExited] = useState<number | null>(null);
	const [size, setSize] = useState<{ cols: number; rows: number }>({ cols: 80, rows: 24 });
	const [restartToken, setRestartToken] = useState(0);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	const sessionRef = useRef<string | null>(null);
	const stickRef = useRef(true);
	const resizeTimer = useRef<number | null>(null);

	const append = useCallback((data: string) => {
		setLines((current) => {
			const next = [...current];
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
			if (next.length > MAX_LINES) {
				const overflow = next.length - MAX_LINES;
				setDropped((currentDropped) => currentDropped + overflow);
				return next.slice(next.length - MAX_LINES);
			}
			return next;
		});
	}, []);

	const send = useCallback((data: string) => {
		const id = sessionRef.current;
		if (id === null) return;
		void ptyWrite(id, data).catch(() => undefined);
	}, []);

	const restart = useCallback(() => {
		setLines([]);
		setDropped(0);
		setExited(null);
		setError(null);
		setRestartToken((current) => current + 1);
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: restartToken triggers a new session
	useEffect(() => {
		let cancelled = false;
		let unOutput: (() => void) | undefined;
		let unExited: (() => void) | undefined;
		const open = async () => {
			try {
				unOutput = await onPtyOutput((event: PtyOutputEvent) => {
					if (event.id !== sessionRef.current) return;
					append(event.data);
				});
				unExited = await onPtyExited((event: PtyExitedEvent) => {
					if (event.id !== sessionRef.current) return;
					setExited(event.code);
					append(`\nexited with code ${event.code ?? 0}`);
				});
				if (cancelled) return;
				const el = containerRef.current;
				const width = el ? el.clientWidth : 800;
				const cols = Math.max(20, Math.floor(width / 8));
				const h = el ? el.clientHeight : 200;
				const rows = Math.max(8, Math.floor(h / 18));
				setSize({ cols, rows });
				const id = await ptyOpen(root, rows, cols);
				if (cancelled) {
					void ptyClose(id).catch(() => undefined);
					return;
				}
				sessionRef.current = id;
			} catch (err) {
				if (!cancelled) {
					setError(`Terminal unavailable: ${describe(err)}`);
				}
			}
		};
		void open();
		return () => {
			cancelled = true;
			unOutput?.();
			unExited?.();
			const id = sessionRef.current;
			sessionRef.current = null;
			if (id !== null) {
				void ptyClose(id).catch(() => undefined);
			}
		};
	}, [root, restartToken, append]);

	// resize observer, debounced
	useEffect(() => {
		const el = containerRef.current;
		if (el === null) return;
		const schedule = () => {
			if (resizeTimer.current !== null) {
				window.clearTimeout(resizeTimer.current);
			}
			resizeTimer.current = window.setTimeout(() => {
				resizeTimer.current = null;
				const id = sessionRef.current;
				if (id === null) return;
				const cols = Math.max(20, Math.floor(el.clientWidth / 8));
				const rows = Math.max(8, Math.floor(el.clientHeight / 18));
				setSize({ cols, rows });
				void ptyResize(id, rows, cols).catch(() => undefined);
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll trigger depends on line count
	useEffect(() => {
		const el = containerRef.current;
		if (el === null) return;
		if (stickRef.current) {
			el.scrollTop = el.scrollHeight;
		}
	}, [lines.length, dropped]);

	const onScroll = useCallback(() => {
		const el = containerRef.current;
		if (el === null) return;
		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
		stickRef.current = atBottom;
	}, []);

	const onKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (exited !== null && event.key === "Enter") {
				event.preventDefault();
				restart();
				return;
			}
			if (event.metaKey && (event.key === "k" || event.key === "K")) {
				event.preventDefault();
				event.stopPropagation();
				setLines([]);
				setDropped(0);
				return;
			}
			if (event.metaKey && (event.key === "l" || event.key === "L")) {
				event.preventDefault();
				event.stopPropagation();
				send("\x0c");
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
		[exited, restart, send],
	);

	const displayed: string[] = dropped > 0 ? [`… ${dropped} lines dropped`, ...lines] : lines;

	return (
		<section className="terminal" aria-label="Terminal">
			<div className="terminal-head">
				<span className="label">terminal</span>
				<span className="terminal-shell">{root}</span>
				<span className="terminal-size">
					{size.cols}x{size.rows}
				</span>
				<button type="button" className="terminal-restart" onClick={restart}>
					Restart
				</button>
				{exited !== null ? <span className="terminal-exit">exited {exited}</span> : null}
			</div>
			{error !== null ? (
				<div className="terminal-error">{error}</div>
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

function describe(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (typeof err === "string") return err;
	return String(err);
}
