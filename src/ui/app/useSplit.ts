import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PANEL_SIZES, PANEL_LIMITS } from "@/lib/consts/layout";
import type { FileBuffer } from "@/lib/project/buffer";

/** What the split editor is, as the shell holds it: one path that is not the active tab, or none. */
export type SplitEditor = {
	/** The buffer the right pane shows, or null while the split is closed. */
	path: string | null;
	/** Pane width in px, owned here so the handle and the pane cannot disagree. */
	width: number;
	setPath: (path: string | null) => void;
	setWidth: (next: number) => void;
	/** Open on the most recently read other buffer, or close when already open. */
	toggle: () => void;
	close: () => void;
};

/** Nothing to put beside the active file is the one refusal, and it is the user's to fix. */
export const SPLIT_NEEDS_ANOTHER_FILE = "Open another file to split the editor";

/**
 * The second code pane beside the active file.
 *
 * It holds a path, never a buffer: the workspace stays the single owner of text, so a keystroke in
 * either pane writes the one buffer it belongs to. The pane's path follows the file list — a closed
 * buffer takes the split with it — and a project reset clears it through `resetProjectState`.
 */
export function useSplit(options: {
	buffers: FileBuffer[];
	activePath: string | null;
	onNotice: (message: string | null) => void;
}): SplitEditor {
	const { buffers, activePath, onNotice } = options;
	const [path, setPath] = useState<string | null>(null);
	const [width, setWidth] = useState(DEFAULT_PANEL_SIZES.splitWidth);
	/** Files the caret left, newest first: what `toggle` prefers over an arbitrary other tab. */
	const history = useRef<string[]>([]);
	const previousActive = useRef<string | null>(activePath);

	// Switching tabs records the file that just lost the caret, so a second split opens on the one
	// the user was reading a moment ago rather than on whatever tab happens to sit nearby.
	useEffect(() => {
		const previous = previousActive.current;
		previousActive.current = activePath;
		if (previous === null || previous === activePath) return;
		history.current = [previous, ...history.current.filter((entry) => entry !== previous)];
	}, [activePath]);

	// A closed buffer cannot stay on screen, and the left tab strip is the only navigator, so the
	// split closes instead of showing a file nothing points at any more.
	useEffect(() => {
		if (path === null) return;
		if (buffers.some((buffer) => buffer.path === path)) return;
		setPath(null);
	}, [buffers, path]);

	const close = useCallback(() => setPath(null), []);

	const setWidth_ = useCallback((next: number) => {
		const { min, max } = PANEL_LIMITS.splitWidth;
		setWidth(Math.min(max, Math.max(min, Math.round(next))));
	}, []);

	/** The most recent file that is neither the active one nor closed, else the nearest other tab. */
	const toggle = useCallback(() => {
		if (path !== null) {
			setPath(null);
			return;
		}
		const open = new Set(buffers.map((buffer) => buffer.path));
		const recent = history.current.find((entry) => entry !== activePath && open.has(entry));
		const others = buffers.filter((buffer) => buffer.path !== activePath);
		const last = others[others.length - 1];
		const next = recent ?? last?.path ?? null;
		if (next === null) {
			onNotice(SPLIT_NEEDS_ANOTHER_FILE);
			return;
		}
		setPath(next);
	}, [buffers, activePath, path, onNotice]);

	return { path, width, setPath, setWidth: setWidth_, toggle, close };
}
