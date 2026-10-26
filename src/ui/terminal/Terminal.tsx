import { useCallback, useEffect, useRef } from "react";
import { ptyResize } from "@/lib/project/api";
import { ptySize } from "@/lib/terminal/sessions";
import "@/ui/terminal/terminal.css";
import TerminalHeader from "@/ui/terminal/TerminalHeader";
import TerminalScreen from "@/ui/terminal/TerminalScreen";
import { useTerminalKeys, useTerminalTabKeys } from "@/ui/terminal/useTerminalKeys";
import { useTerminalRestart } from "@/ui/terminal/useTerminalRestart";
import { useTerminalSessions } from "@/ui/terminal/useTerminalSessions";

const RESIZE_DEBOUNCE_MS = 120;

export type TerminalProps = {
	root: string;
	activePath?: string | null;
	/** Font size a new session starts at; the settings page owns the default. */
	defaultFontSize?: number;
	/** "right" docks the terminal as a column beside the editor instead of under it. */
	placement?: "bottom" | "right";
	/** Terminal font family; empty keeps the built-in monospace stack. */
	fontFamily?: string;
};

/**
 * The terminal panel.
 *
 * Session state, the PTY listeners and the keymap live in their own modules; this file is the shell
 * that wires them together and draws the frame.
 */
export default function Terminal({
	root,
	activePath,
	defaultFontSize,
	placement = "bottom",
	fontFamily = "",
}: TerminalProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	const resizeTimer = useRef<number | null>(null);
	const {
		sessions,
		activeId,
		setActiveId,
		activeIdRef,
		updateSession,
		openSession,
		closeSession,
		send,
	} = useTerminalSessions({ root, activePath, defaultFontSize, containerRef });

	const active = sessions.find((s) => s.id === activeId) ?? null;

	// Open the first tab once, so the panel is never an empty box.
	// biome-ignore lint/correctness/useExhaustiveDependencies: mount only
	useEffect(() => {
		void openSession();
	}, []);

	const restart = useTerminalRestart({
		root,
		activePath,
		activeId,
		sessions,
		containerRef,
		updateSession,
	});

	// A resize changes the grid, so the shell has to learn its new size.
	useEffect(() => {
		const el = containerRef.current;
		if (el === null) return;
		const schedule = () => {
			if (resizeTimer.current !== null) window.clearTimeout(resizeTimer.current);
			resizeTimer.current = window.setTimeout(() => {
				resizeTimer.current = null;
				const id = activeIdRef.current;
				const session = sessions.find((s) => s.id === id);
				if (session?.ptyId === null || session?.ptyId === undefined) return;
				const { rows, cols } = ptySize(el);
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
	}, [activeIdRef, sessions]);

	// Keep the view pinned to the newest line unless the user scrolled away.
	useEffect(() => {
		const el = containerRef.current;
		if (el === null || active === null || !active.stick) return;
		el.scrollTop = el.scrollHeight;
	}, [active]);

	useTerminalTabKeys(openSession, closeSession, activeIdRef);

	const onScroll = useCallback(() => {
		const el = containerRef.current;
		if (el === null || activeId === null) return;
		const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
		updateSession(activeId, (s) => ({ ...s, stick: atBottom }));
	}, [activeId, updateSession]);

	const { onKeyDown } = useTerminalKeys({
		active,
		send,
		restart,
		openSession,
		closeSession,
		updateSession,
		activeIdRef,
	});

	const displayed: string[] =
		active === null
			? []
			: active.dropped > 0
				? [`… ${active.dropped} lines dropped`, ...active.lines]
				: active.lines;

	return (
		<section
			className={placement === "right" ? "terminal terminal-side" : "terminal"}
			aria-label="Terminal"
		>
			<TerminalHeader
				sessions={sessions}
				active={active}
				activeId={activeId}
				onSelect={setActiveId}
				onOpen={() => void openSession()}
				onClose={closeSession}
				onRestart={restart}
				updateSession={updateSession}
			/>
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
			) : (
				<TerminalScreen
					active={active}
					displayed={displayed}
					fontFamily={fontFamily}
					containerRef={containerRef}
					onScroll={onScroll}
				/>
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
