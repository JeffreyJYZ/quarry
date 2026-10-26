import { useEffect, useRef } from "react";
import { DEFAULT_FONT_SIZE } from "@/lib/terminal/fontSize";
import "@/ui/terminal/terminal.css";
import "@/ui/terminal/xterm.css";
import { shouldFocusTerminal } from "@/ui/terminal/focusTarget";
import TerminalHeader from "@/ui/terminal/TerminalHeader";
import TerminalScreen from "@/ui/terminal/TerminalScreen";
import { useTerminalTabKeys } from "@/ui/terminal/useTerminalKeys";
import { useTerminalRestart } from "@/ui/terminal/useTerminalRestart";
import { useTerminalSessions } from "@/ui/terminal/useTerminalSessions";
import { useXterm } from "@/ui/terminal/useXterm";

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
 * Session state, the PTY listeners and the emulator live in their own modules; this file is the
 * shell that wires them together and draws the frame.
 */
export default function Terminal({
	root,
	activePath,
	defaultFontSize,
	placement = "bottom",
	fontFamily = "",
}: TerminalProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const {
		sessions,
		activeId,
		setActiveId,
		activeIdRef,
		sessionsRef,
		updateSession,
		openSession,
		closeSession,
		send,
		subscribeRaw,
	} = useTerminalSessions({ root, activePath, defaultFontSize, containerRef });

	const active = sessions.find((s) => s.id === activeId) ?? null;

	// The emulator is per PTY, so a new tab or a restart gets a fresh screen rather than a leftover.
	const { write, focus } = useXterm({
		hostRef: containerRef,
		ptyId: active?.ptyId ?? null,
		fontSize: active?.fontSize ?? DEFAULT_FONT_SIZE,
		fontFamily,
		onData: send,
	});

	// Open the first tab once, so the panel is never an empty box.
	// biome-ignore lint/correctness/useExhaustiveDependencies: mount only
	useEffect(() => {
		void openSession();
	}, []);

	// Selecting a tab, and a fresh PTY inside it, both hand the keyboard to the shell.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the PTY id is the trigger, not a value
	useEffect(() => {
		if (activeId === null) return;
		focus();
	}, [activeId, active?.ptyId, focus]);

	const restart = useTerminalRestart({
		root,
		activePath,
		activeId,
		sessions,
		containerRef,
		updateSession,
	});

	useTerminalTabKeys(openSession, closeSession, activeIdRef);

	// Raw bytes for the active tab only: the buffer replays a session's pre-handshake output here too.
	useEffect(
		() =>
			subscribeRaw((ptyId, data) => {
				const current = sessionsRef.current.find((s) => s.id === activeIdRef.current);
				if (current?.ptyId !== ptyId) return;
				write(data);
			}),
		[subscribeRaw, sessionsRef, activeIdRef, write],
	);

	const selectTab = (id: number) => {
		setActiveId(id);
		focus();
	};
	const onPanelMouseDown = (event: React.MouseEvent<HTMLElement>) => {
		if (shouldFocusTerminal(event.target)) focus();
	};

	return (
		<section
			className={placement === "right" ? "terminal terminal-side" : "terminal"}
			aria-label="Terminal"
			onMouseDown={onPanelMouseDown}
		>
			<TerminalHeader
				sessions={sessions}
				active={active}
				activeId={activeId}
				onSelect={selectTab}
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
				<TerminalScreen active={active} hostRef={containerRef} />
			)}
		</section>
	);
}
