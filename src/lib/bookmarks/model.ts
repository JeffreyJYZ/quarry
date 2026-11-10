import { fileName, relativeTo } from "@/lib/project/paths";

/** One anonymous bookmark, as the backend reports it. */
export type Bookmark = {
	/** Absolute path of the file, so a row can be opened without the root in hand. */
	path: string;
	/** 1-based line the bookmark sits on. */
	line: number;
	/** The line's own text, read at load time; empty after the line was deleted. */
	text: string;
};

/** The bookmarks of one file, in the order the tool window draws them. */
export type BookmarkGroup = {
	path: string;
	/** Path relative to the project root, which is what the group header shows. */
	label: string;
	rows: Bookmark[];
};

/**
 * Groups by file and orders both levels.
 *
 * The backend already sorts, but the window must stay deterministic when a caller hands it rows
 * from somewhere else — a test, an optimistic update — so the ordering is part of this contract.
 */
export function groupBookmarks(rows: readonly Bookmark[], root: string | null): BookmarkGroup[] {
	const byPath = new Map<string, Bookmark[]>();
	for (const row of rows) {
		const existing = byPath.get(row.path);
		if (existing === undefined) byPath.set(row.path, [row]);
		else existing.push(row);
	}
	const groups: BookmarkGroup[] = [];
	for (const [path, groupRows] of byPath) {
		const label = (root === null ? null : relativeTo(root, path)) ?? fileName(path);
		groups.push({
			path,
			label,
			rows: [...groupRows].sort((left, right) => left.line - right.line),
		});
	}
	return groups.sort((left, right) => left.label.localeCompare(right.label));
}

/** The 1-based lines the gutter paints for `path`, ascending and unique. */
export function bookmarkLines(rows: readonly Bookmark[], path: string | null): number[] {
	if (path === null) return [];
	const lines = rows.filter((row) => row.path === path).map((row) => row.line);
	return [...new Set(lines)].sort((left, right) => left - right);
}
