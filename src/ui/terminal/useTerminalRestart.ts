import { useCallback } from "react";
import { ptyClose, ptyOpen } from "@/lib/project/api";
import { DEFAULT_FONT_SIZE } from "@/lib/terminal/fontSize";
import { dirOf, ptySize, type Session } from "@/lib/terminal/sessions";

/**
 * Restarts a tab in place: same cwd, same font size, a fresh shell.
 *
 * A restart is not a close-and-open because the tab must keep its position in the strip.
 */
export function useTerminalRestart(options: {
	root: string;
	activePath: string | null | undefined;
	activeId: number | null;
	sessions: Session[];
	containerRef: React.RefObject<HTMLDivElement | null>;
	updateSession: (id: number, updater: (s: Session) => Session) => void;
}) {
	const { root, activePath, activeId, sessions, containerRef, updateSession } = options;

	return useCallback(() => {
		if (activeId === null) return;
		const session = sessions.find((s) => s.id === activeId);
		if (session?.ptyId !== null && session?.ptyId !== undefined) {
			void ptyClose(session.ptyId).catch(() => undefined);
		}
		const cwd =
			session?.cwd ??
			(activePath !== null && activePath !== undefined ? dirOf(activePath) : root);
		updateSession(activeId, (s) => ({
			...s,
			ptyId: null,
			pid: null,
			lines: [],
			dropped: 0,
			exited: null,
			error: null,
			opening: true,
			stick: true,
			fontSize: session?.fontSize ?? DEFAULT_FONT_SIZE,
		}));
		void (async () => {
			try {
				const { rows, cols } = ptySize(containerRef.current);
				const result = await ptyOpen(cwd, rows, cols);
				updateSession(activeId, (s) => ({
					...s,
					ptyId: result.id,
					pid: result.pid,
					opening: false,
				}));
			} catch (err) {
				updateSession(activeId, (s) => ({
					...s,
					error: `Terminal unavailable: ${err instanceof Error ? err.message : String(err)}`,
					opening: false,
				}));
			}
		})();
	}, [activeId, sessions, root, activePath, containerRef, updateSession]);
}
