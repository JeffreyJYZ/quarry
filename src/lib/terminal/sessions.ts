import { feedChunk } from "@/lib/terminal/ansi";
import { DEFAULT_FONT_SIZE } from "@/lib/terminal/fontSize";

/** Session bookkeeping for the terminal panel: pure helpers, no React. */

/** Scrollback cap; older lines are dropped and counted. */
export const MAX_LINES = 4000;

export type Session = {
	id: number;
	ptyId: string | null;
	pid: number | null;
	cwd: string;
	title: string | null;
	lines: string[];
	dropped: number;
	exited: number | null;
	error: string | null;
	opening: boolean;
	fontSize: number;
};

export function emptySession(id: number, cwd: string, fontSize = DEFAULT_FONT_SIZE): Session {
	return {
		id,
		ptyId: null,
		pid: null,
		cwd,
		title: null,
		lines: [],
		dropped: 0,
		exited: null,
		error: null,
		opening: true,
		fontSize,
	};
}

export function describe(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (typeof err === "string") return err;
	return String(err);
}

export function appendData(prev: Session, data: string): Session {
	const next = feedChunk(prev.lines, data);
	let dropped = prev.dropped;
	if (next.length > MAX_LINES) {
		const overflow = next.length - MAX_LINES;
		dropped += overflow;
		return { ...prev, lines: next.slice(next.length - MAX_LINES), dropped };
	}
	return { ...prev, lines: next, dropped };
}

export function dirOf(path: string): string {
	const idx = path.lastIndexOf("/");
	return idx > 0 ? path.slice(0, idx) : path;
}

/** Two trailing path segments, so a tab stays narrow on a deep checkout. */
export function shortCwd(cwd: string): string {
	const parts = cwd.split("/").filter((p) => p.length > 0);
	const tail = parts.slice(-2).join("/");
	return `…/${tail}`;
}

/** Visible tab name: a user rename wins, otherwise the directory's short form. */
export function tabLabel(session: Session): string {
	return session.title ?? shortCwd(session.cwd);
}

/** The PTY's grid size for a host element, with the minimums a shell needs. */
export function ptySize(element: HTMLElement | null): { rows: number; cols: number } {
	const width = element ? element.clientWidth : 800;
	const height = element ? element.clientHeight : 200;
	return {
		cols: Math.max(20, Math.floor(width / 8)),
		rows: Math.max(8, Math.floor(height / 18)),
	};
}
