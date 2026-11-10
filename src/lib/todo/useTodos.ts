import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchProject, type SearchMatch } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import { whenCurrent } from "@/lib/search/stale";
import {
	countTodos,
	TODO_MAX_RESULTS,
	TODO_PATTERN,
	type TodoFile,
	todoFiles,
	todoPathListed,
} from "./model";

export type TodoController = {
	files: TodoFile[];
	/** Rows across every group, so the tab and the panel read the same number. */
	count: number;
	loading: boolean;
	error: string | null;
	/** The scan hit its cap, so the list is the first markers rather than all of them. */
	truncated: boolean;
	/** Rescan on demand. */
	refresh: () => void;
	/** Rescan when the saved path is one the list already names. */
	noteSaved: (path: string) => void;
};

/**
 * The project's TODO markers, scanned through the project search.
 *
 * The list is fetched when a project opens and then only when asked: a refresh button, or a save of
 * a file it already names (a save is the one edit that can add or remove a marker without a scan).
 * There is no polling — a marker list is a place to jump from, not a live feed.
 */
export function useTodos(root: string | null): TodoController {
	const [matches, setMatches] = useState<SearchMatch[]>([]);
	const [truncated, setTruncated] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [scanToken, setScanToken] = useState(0);
	/** Each scan retires the previous ticket, so a late answer cannot overwrite a newer one. */
	const sequence = useRef(0);

	const files = useMemo(() => todoFiles(matches), [matches]);
	const count = useMemo(() => countTodos(files), [files]);
	// The save hook asks "is this path listed?" without re-creating its callback on every scan.
	const filesRef = useRef<TodoFile[]>(files);
	filesRef.current = files;

	useEffect(() => {
		// `scanToken` is a re-scan trigger, not a value the scan reads: a refresh bumps it so this
		// effect runs again without the hook keeping a second callback.
		void scanToken;
		const ticket = sequence.current + 1;
		sequence.current = ticket;
		setError(null);
		if (root === null) {
			setMatches([]);
			setTruncated(false);
			setLoading(false);
			return;
		}
		setLoading(true);
		void (async () => {
			try {
				const report = await searchProject(root, TODO_PATTERN, TODO_MAX_RESULTS);
				whenCurrent(ticket, sequence.current, () => {
					setMatches(report.matches);
					setTruncated(report.truncated);
				});
			} catch (failure) {
				whenCurrent(ticket, sequence.current, () => {
					setMatches([]);
					setTruncated(false);
					setError(describeError(failure));
				});
			} finally {
				whenCurrent(ticket, sequence.current, () => setLoading(false));
			}
		})();
	}, [root, scanToken]);

	const refresh = useCallback(() => {
		setScanToken((current) => current + 1);
	}, []);

	const noteSaved = useCallback((path: string) => {
		if (todoPathListed(filesRef.current, path)) {
			setScanToken((current) => current + 1);
		}
	}, []);

	return { files, count, loading, error, truncated, refresh, noteSaved };
}
