import { useCallback, useMemo } from "react";
import type { DebugController } from "@/lib/debug/session";
import { changesByPath } from "@/lib/git/changes";
import type { GitStatus, GitStatusEntry } from "@/lib/project/api";
import type { FileBuffer } from "@/lib/project/buffer";
import { activeFrame } from "@/ui/debug/dock/addresses";

/**
 * Identity-stable values the shell hands down.
 *
 * A keystroke re-renders the shell, so a value rebuilt on every render makes every consumer of it
 * look new: an effect with it in its dependency list re-runs, and a memoised child re-renders. Each
 * hook here rebuilds only when the data it reads changes, and that dependency list is the whole
 * invalidation contract — a field read without being listed is how a stale value ships.
 */

/** Paths open in tabs. Rebuilt when the buffer list changes: a tab opens, closes, moves or is edited. */
export function useOpenPaths(buffers: FileBuffer[]): Set<string> {
	return useMemo(() => new Set(buffers.map((buffer) => buffer.path)), [buffers]);
}

/** A caret request with the token that makes a repeat of the same line a real change. */
export type EditorReveal = { line: number; character: number; token: number } | null;

/**
 * The caret request the editor applies. `target` is state and keeps its identity until the next
 * go-to; `token` bumps to repeat the same target, so those two are the whole dependency.
 */
export function useEditorReveal(
	target: { line: number; character: number } | null,
	token: number,
): EditorReveal {
	return useMemo(() => (target === null ? null : { ...target, token }), [target, token]);
}

/** The assembly split beside the editor, or null when it is closed. */
export type DisasmSplit = {
	session: string | null;
	address: string | null;
	frameId: number | null;
	/** Split width in px, owned by the shell so the handle and the pane agree. */
	width: number;
	onWidthChange: (next: number) => void;
	onClose: () => void;
} | null;

/**
 * The assembly split, or null when closed. Invalidated by the split's own flag and width, the
 * session, and the frame the pane follows — nothing else on the shell changes it.
 *
 * `activeFrame` reads the selected frame, else the top of the stack, so `stopView` is the one
 * debugger field the address and frame id depend on; a keystroke never replaces it.
 */
export function useDisasmSplit(options: {
	open: boolean;
	width: number;
	debug: DebugController;
	onWidthChange: (next: number) => void;
	setOpen: (open: boolean) => void;
}): DisasmSplit {
	const { open, width, debug, onWidthChange, setOpen } = options;
	const stopView = debug.stopView;
	const session = debug.sessionId;
	const close = useCallback(() => setOpen(false), [setOpen]);
	return useMemo(() => {
		if (!open) return null;
		const frame = activeFrame(stopView);
		return {
			session,
			address: frame?.instructionPointer ?? null,
			frameId: frame?.id ?? null,
			width,
			onWidthChange,
			onClose: close,
		};
	}, [open, stopView, session, width, onWidthChange, close]);
}

/**
 * Path to status for the explorer. Invalidated only by a new status read, which replaces the whole
 * `GitStatus`; typing in the editor never produces one.
 */
export function useChanges(status: GitStatus | null): Record<string, GitStatusEntry["status"]> {
	return useMemo(() => changesByPath(status), [status]);
}
