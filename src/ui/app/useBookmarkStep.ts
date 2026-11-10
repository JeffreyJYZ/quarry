import { useCallback } from "react";
import type { BookmarkGroup } from "@/lib/bookmarks/model";
import { type BookmarkStep, selectBookmark } from "@/lib/bookmarks/navigate";

/**
 * The next-or-previous walk, wired to the caret and the reveal the shell owns.
 *
 * The rule itself is `selectBookmark`: this only hands it the dock's order, the caret's 1-based line
 * and the direction, and turns the answer back into the zero-based position a navigation takes.
 */
export function useBookmarkStep(options: {
	groups: BookmarkGroup[];
	activePath: string | null;
	cursor: { line: number } | null;
	navigate: (path: string, line: number, character: number) => void;
}): (direction: BookmarkStep) => void {
	const { groups, activePath, cursor, navigate } = options;
	return useCallback(
		(direction: BookmarkStep) => {
			const rows = groups.flatMap((group) => group.rows);
			if (rows.length === 0) return;
			const line = cursor === null ? 1 : cursor.line + 1;
			const target = selectBookmark(rows, { path: activePath, line }, direction);
			if (target !== null) navigate(target.path, target.line - 1, 0);
		},
		[groups, activePath, cursor, navigate],
	);
}
