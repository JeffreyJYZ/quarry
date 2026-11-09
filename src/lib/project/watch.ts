/**
 * What one batch of externally changed paths means for the explorer and the open buffers.
 *
 * The decisions are pure so the dangerous case is testable without a Tauri window: a dirty buffer
 * must never be replaced by disk text, a deleted file must not keep a tab pointing nowhere, and a
 * directory that was never listed must not be refreshed into existence.
 */

import { type FileBuffer, isDirty } from "./buffer";
import { fileName, parentDir } from "@/lib/project/paths";

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

/** Everything one batch means for the open buffers, decided before anything is touched. */
export type ExternalBatchPlan = {
	/** Files that changed on disk and can take the disk text. */
	reload: FileBuffer[];
	/** Files that changed while dirty: the in-memory text wins. */
	conflicts: FileBuffer[];
	/** Clean buffers whose file is gone, so the tab can close. */
	close: FileBuffer[];
	/** Buffers whose file is gone but whose text must stay. */
	keep: FileBuffer[];
	/** Rename pairs proven by name, to be moved in place with their text and dirty state. */
	moves: Array<{ buffer: FileBuffer; to: string; name: string }>;
	/** One line per outcome the user has to hear about. */
	notices: string[];
};

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
	const groups = new Map<string, T[]>();
	for (const item of items) {
		const name = key(item);
		const group = groups.get(name);
		if (group === undefined) groups.set(name, [item]);
		else group.push(item);
	}
	return groups;
}

/**
 * Plan a batch against the disk that is left after it.
 *
 * `existing` names the batch paths still present as files. A buffer whose path is in the batch but
 * not in `existing` has vanished: a clean one closes, a dirty one keeps its tab and its text. A
 * vanished path and a created path with the same file name are a rename only when each side has
 * exactly one candidate; anything else is ambiguous and keeps the tab, because a wrong close loses
 * text and a wrong move points the editor at the wrong file.
 */
export function planWatchBatch(
	buffers: readonly FileBuffer[],
	paths: readonly string[],
	existing: ReadonlySet<string>,
): ExternalBatchPlan {
	const plan: ExternalBatchPlan = {
		reload: [],
		conflicts: [],
		close: [],
		keep: [],
		moves: [],
		notices: [],
	};
	const batch = new Set(paths);
	const open = new Set(buffers.map((buffer) => buffer.path));
	const vanished = buffers.filter(
		(buffer) => batch.has(buffer.path) && !existing.has(buffer.path),
	);
	const vanishedPaths = new Set(vanished.map((buffer) => buffer.path));

	for (const buffer of buffers) {
		if (!batch.has(buffer.path) || vanishedPaths.has(buffer.path)) continue;
		if (isDirty(buffer)) plan.conflicts.push(buffer);
		else plan.reload.push(buffer);
	}

	const created = paths.filter((path) => !open.has(path) && existing.has(path));
	const vanishedByName = groupBy(vanished, (buffer) => buffer.name);
	const createdByName = groupBy(created, fileName);
	const moves = new Map<string, string>();
	const ambiguous = new Set<string>();
	for (const [name, olds] of vanishedByName) {
		const news = createdByName.get(name) ?? [];
		if (news.length === 0) continue;
		const old = olds[0];
		const target = news[0];
		if (olds.length === 1 && news.length === 1 && old !== undefined && target !== undefined) {
			moves.set(old.path, target);
		} else {
			ambiguous.add(name);
		}
	}

	for (const buffer of vanished) {
		const target = moves.get(buffer.path);
		if (target !== undefined) {
			plan.moves.push({ buffer, to: target, name: fileName(target) });
			continue;
		}
		if (ambiguous.has(buffer.name)) {
			plan.keep.push(buffer);
			plan.notices.push(`Deleted ${buffer.name}: could not tell whether it moved, tab kept`);
			continue;
		}
		if (isDirty(buffer)) {
			plan.keep.push(buffer);
			plan.notices.push(`Deleted ${buffer.name}: the text on screen is unsaved`);
			continue;
		}
		plan.close.push(buffer);
		plan.notices.push(`Deleted ${buffer.name}`);
	}
	return plan;
}
