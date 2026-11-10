import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bookmarkLines, groupBookmarks, type Bookmark } from "@/lib/bookmarks/model";
import { clearBookmarks, listBookmarks, toggleBookmark } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";

/**
 * The project's bookmarks, kept in step with the backend.
 *
 * They are per project root, so opening another project replaces the list instead of merging with
 * it; a response that lands after the root changed is dropped rather than allowed to overwrite the
 * new project's rows.
 */
export function useBookmarks(options: {
	root: string | null;
	activePath: string | null;
	onNotice: (message: string | null) => void;
}) {
	const { root, activePath, onNotice } = options;
	const [rows, setRows] = useState<Bookmark[]>([]);
	const requestRef = useRef(0);

	useEffect(() => {
		requestRef.current += 1;
		const request = requestRef.current;
		if (root === null) {
			setRows([]);
			return;
		}
		listBookmarks(root)
			.then((next) => {
				if (requestRef.current === request) setRows(next);
			})
			.catch((error) => {
				if (requestRef.current !== request) return;
				setRows([]);
				onNotice(describeError(error));
			});
		return () => {
			if (requestRef.current === request) requestRef.current += 1;
		};
	}, [root, onNotice]);

	const apply = useCallback(
		async (path: string, line: number) => {
			if (root === null) return;
			try {
				setRows(await toggleBookmark(root, path, line));
			} catch (error) {
				onNotice(describeError(error));
			}
		},
		[root, onNotice],
	);

	/** The keyboard and gutter path: toggles the caret's line in the active file. */
	const toggle = useCallback(
		(line: number) => {
			if (activePath !== null) void apply(activePath, line);
		},
		[activePath, apply],
	);

	/** The tool window's row action; a bookmark is removed by toggling the same line again. */
	const remove = useCallback((path: string, line: number) => void apply(path, line), [apply]);

	const clear = useCallback(async () => {
		if (root === null) return;
		try {
			await clearBookmarks(root);
			setRows([]);
		} catch (error) {
			onNotice(describeError(error));
		}
	}, [root, onNotice]);

	const lines = useMemo(() => bookmarkLines(rows, activePath), [rows, activePath]);
	const groups = useMemo(() => groupBookmarks(rows, root), [rows, root]);

	return { rows, groups, lines, toggle, remove, clear };
}

export type BookmarksController = ReturnType<typeof useBookmarks>;
