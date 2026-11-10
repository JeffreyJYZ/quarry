import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PANEL_SIZES, PANEL_LIMITS } from "@/lib/consts/layout";
import type { FileBuffer } from "@/lib/project/buffer";

/** What the split editor is, as the shell holds it: a path that is not the active tab, or none. */
export type SplitEditor = {
	/** Whether the pane is on screen. It can be open with no path, when there is no other file. */
	open: boolean;
	/** The buffer the right pane shows, or null while nothing is on show. */
	path: string | null;
	/** Pane width in px, owned here so the handle and the pane cannot disagree. */
	width: number;
	/** Points the pane at another open file; the left pane's own file is refused. */
	setPath: (path: string) => void;
	setWidth: (next: number) => void;
	/** Open on the most recently read other buffer, or close when already open. */
	toggle: () => void;
	close: () => void;
};

/**
 * The second code pane beside the active file.
 *
 * It holds a path, never a buffer: the workspace stays the single owner of text, so a keystroke in
 * either pane writes the one buffer it belongs to. The pane's path follows the file list — a closed
 * buffer takes the split with it — and a project reset clears it through `resetProjectState`.
 *
 * The pane itself opens even when there is only one file, so the header's picker can list what is
 * open instead of a chord refusing with a notice. It never shows the left pane's own buffer: with
 * nothing else open the body says so, and shows the nearest other file once one exists.
 */
export function useSplit(options: {
	buffers: FileBuffer[];
	activePath: string | null;
}): SplitEditor {
	const { buffers, activePath } = options;
	const [open, setOpen] = useState(false);
	const [path, setPathState] = useState<string | null>(null);
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

	/** The file the pane should show instead: the most recent other buffer, else the last other tab. */
	const pickOther = useCallback((): string | null => {
		const openPaths = new Set(buffers.map((buffer) => buffer.path));
		const recent = history.current.find(
			(entry) => entry !== activePath && openPaths.has(entry),
		);
		const others = buffers.filter((buffer) => buffer.path !== activePath);
		return recent ?? others[others.length - 1]?.path ?? null;
	}, [buffers, activePath]);

	// The pane must always show a file that is really open and is not the left pane's: a closed
	// buffer, or one the user just activated on the left, hands the pane the nearest other file, and
	// with none left it empties instead of showing the same buffer twice.
	useEffect(() => {
		if (!open) return;
		const stillOpen = path !== null && buffers.some((buffer) => buffer.path === path);
		if (stillOpen && path !== activePath) return;
		setPathState(pickOther());
	}, [open, path, activePath, buffers, pickOther]);

	const close = useCallback(() => {
		setOpen(false);
		setPathState(null);
	}, []);

	const setPath = useCallback(
		(next: string) => {
			if (next === activePath) return;
			setPathState(next);
		},
		[activePath],
	);

	const setWidth_ = useCallback((next: number) => {
		const { min, max } = PANEL_LIMITS.splitWidth;
		setWidth(Math.min(max, Math.max(min, Math.round(next))));
	}, []);

	const toggle = useCallback(() => {
		if (open) {
			close();
			return;
		}
		setOpen(true);
		setPathState(pickOther());
	}, [open, close, pickOther]);

	return { open, path, width, setPath, setWidth: setWidth_, toggle, close };
}
