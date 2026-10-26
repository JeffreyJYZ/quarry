import { useEffect } from "react";

/**
 * Cmd+T opens and Cmd+W closes a tab even when focus sits outside the terminal.
 *
 * Keystrokes themselves belong to xterm: it translates every chord into the bytes a terminal
 * expects and hands them to `onData`, so nothing here re-implements a keymap.
 */
import { inEditableTarget } from "@/ui/app/focusGuard";

export function useTerminalTabKeys(
	openSession: () => Promise<void>,
	closeSession: (id: number) => void,
	activeIdRef: React.RefObject<number | null>,
) {
	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (!event.metaKey || event.ctrlKey || event.altKey) return;
			const target = document.activeElement;
			const inTerminal = target instanceof Element && target.closest(".xterm") !== null;
			if (!inTerminal && inEditableTarget()) return;
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
