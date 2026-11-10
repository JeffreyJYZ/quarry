import type { Bookmark } from "@/lib/bookmarks/model";

/** Which way to walk the bookmark list: forwards is the next one, backwards the previous one. */
export type BookmarkStep = 1 | -1;

/** Where the caret sits: a file that may hold no bookmark at all, and its 1-based line. */
export type BookmarkCursor = {
	path: string | null;
	line: number;
};

/** How a row compares with the caret: negative before it, zero on it, positive after it. */
function fromCursor(row: Bookmark, cursor: BookmarkCursor): number {
	const { path, line } = cursor;
	// No file at all is the top of the list, so the first bookmark is the next one.
	if (path === null) return 1;
	if (row.path !== path) return row.path.localeCompare(path);
	return row.line - line;
}

/**
 * The bookmark a step from the caret lands on.
 *
 * `rows` is the list in the tool window's order — by file, then by line, which is exactly what the
 * dock draws — so a step crosses into the neighbouring file without rebuilding that order. A file
 * with no bookmark is placed by its path, which is the same key the dock sorts on: the first row of
 * a later file is the next one, the last row of an earlier file the previous one.
 *
 * The ends wrap around, so stepping past the last bookmark returns to the first and never leaves the
 * caret where it was. `wrap` off is the plain walk, which answers null at either end.
 */
export function selectBookmark(
	rows: readonly Bookmark[],
	cursor: BookmarkCursor,
	step: BookmarkStep,
	wrap = true,
): Bookmark | null {
	if (rows.length === 0) return null;
	const delta = rows.map((row) => fromCursor(row, cursor));
	if (step === 1) {
		const index = delta.findIndex((value) => value > 0);
		if (index !== -1) return rows[index] ?? null;
		return wrap ? (rows[0] ?? null) : null;
	}
	for (let index = delta.length - 1; index >= 0; index -= 1) {
		if ((delta[index] ?? 0) < 0) return rows[index] ?? null;
	}
	return wrap ? (rows[rows.length - 1] ?? null) : null;
}
