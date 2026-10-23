import { useCallback, useEffect } from "react";
import type { Session } from "@/lib/terminal/sessions";

/** The keymap of the terminal panel: the window-level tab keys and the typing surface. */
export function useTerminalKeys(options: {
	active: Session | null;
	send: (data: string) => void;
	restart: () => void;
	openSession: () => Promise<void>;
	closeSession: (id: number) => void;
	updateSession: (id: number, updater: (s: Session) => Session) => void;
	activeIdRef: React.RefObject<number | null>;
}) {
	const { active, send, restart, openSession, closeSession, updateSession } = options;

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

	return { onKeyDown };
}

/** Cmd+T opens and Cmd+W closes a tab even when focus sits outside the typing surface. */
export function useTerminalTabKeys(
	openSession: () => Promise<void>,
	closeSession: (id: number) => void,
	activeIdRef: React.RefObject<number | null>,
) {
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
	}, [openSession, closeSession, activeIdRef]);
}
