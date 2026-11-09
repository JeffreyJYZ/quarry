/**
 * What one batch of externally changed paths means for the explorer and the open buffers.
 *
 * The decisions are pure so the dangerous case is testable without a Tauri window: a dirty buffer
 * must never be replaced by disk text, and a directory that was never listed must not be refreshed
 * into existence.
 */

import { type FileBuffer, isDirty } from "./buffer";

/** One debounced batch from the Rust watcher, plus a token so an effect sees each batch once. */
export type WatchBatch = { token: number; paths: string[] };

/** What to do with an open buffer whose file is in a changed batch. */
export type BufferAction = "ignore" | "reload" | "conflict";

/**
 * `reload` only for a file that changed on disk and has no unsaved edits.
 *
 * `conflict` is the dirty case, reported to the user and otherwise left alone: the in-memory text
 * wins, because silently swapping it would throw away typing nobody saved.
 */
export function bufferAction(buffer: FileBuffer, changed: ReadonlySet<string>): BufferAction {
	if (!changed.has(buffer.path)) return "ignore";
	return isDirty(buffer) ? "conflict" : "reload";
}

/** The directory above `path`, or `null` for a top-level path such as `/project`. */
export function parentDir(path: string): string | null {
	const cut = path.lastIndexOf("/");
	return cut <= 0 ? null : path.slice(0, cut);
}

/**
 * The listed directories that must be read again.
 *
 * A changed file dirties its parent's listing; a changed directory dirties its own listing and its
 * parent's. Only directories already in `loaded` are returned, so the refresh never expands a
 * subtree the user has not opened.
 */
export function dirsToRefresh(paths: readonly string[], loaded: ReadonlySet<string>): string[] {
	const dirs = new Set<string>();
	for (const path of paths) {
		if (loaded.has(path)) dirs.add(path);
		const parent = parentDir(path);
		if (parent !== null && loaded.has(parent)) dirs.add(parent);
	}
	return [...dirs];
}

/** The buffers one batch touches, split by decision. */
export function buffersToRefresh(
	buffers: readonly FileBuffer[],
	changed: ReadonlySet<string>,
): { reload: FileBuffer[]; conflicts: FileBuffer[] } {
	const reload: FileBuffer[] = [];
	const conflicts: FileBuffer[] = [];
	for (const buffer of buffers) {
		const action = bufferAction(buffer, changed);
		if (action === "reload") reload.push(buffer);
		else if (action === "conflict") conflicts.push(buffer);
	}
	return { reload, conflicts };
}
