/**
 * Quick open's file index, one entry per project root.
 *
 * A list is reused for `STALE_MS` so reopening the palette is instant, but it must not outlive a
 * change to the project: a create, rename or delete drops the entry, so the next open re-lists.
 */

import { STALE_MS } from "@/lib/consts/quickopen";

export type CachedFileList = { files: string[]; fetchedAt: number };

const lists = new Map<string, CachedFileList>();

/** The remembered list for `root` while it is younger than `STALE_MS`, or `null` when stale. */
export function cachedFileList(root: string, now: number): string[] | null {
	const entry = lists.get(root);
	if (entry === undefined || now - entry.fetchedAt >= STALE_MS) return null;
	return entry.files;
}

/** Remember a freshly read list, so the next open within the window needs no disk read. */
export function rememberFileList(root: string, files: string[], now: number): void {
	lists.set(root, { files, fetchedAt: now });
}

/** Forget one project's list; the next read of it goes to disk. */
export function invalidateFileList(root: string): void {
	lists.delete(root);
}
