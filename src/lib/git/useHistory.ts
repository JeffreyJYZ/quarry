import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";
import { type GitCommitEntry, gitLog } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";

export type GitPanelTab = "changes" | "history" | "blame";

type HistoryOptions = {
	root: string;
	tab: GitPanelTab;
	setTab: Dispatch<SetStateAction<GitPanelTab>>;
	onDiff: (path: string | null) => void;
	onCommitDiff: (hash: string | null) => void;
};

/** Owns the history list, its page size and the keyboard navigation over it. */
export function useHistory({ root, tab, setTab, onDiff, onCommitDiff }: HistoryOptions) {
	const [entries, setEntries] = useState<GitCommitEntry[] | null>(null);
	const [limit, setLimit] = useState(50);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selected, setSelected] = useState<number | null>(null);

	const load = useCallback(
		async (next: number) => {
			setLoading(true);
			setError(null);
			try {
				const list = await gitLog(root, next);
				setEntries(list);
				setLimit(next);
				setSelected(null);
			} catch (err) {
				setError(describeError(err));
			} finally {
				setLoading(false);
			}
		},
		[root],
	);

	// Refresh history when the History tab is opened.
	useEffect(() => {
		if (tab !== "history") return;
		void load(limit);
	}, [tab, load, limit]);

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if (tab !== "history") return;
			const target = event.target as HTMLElement | null;
			if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
			if (event.key === "Tab") {
				event.preventDefault();
				setTab("changes");
				onCommitDiff(null);
				return;
			}
			const list = entries ?? [];
			if (list.length === 0) return;
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setSelected((current) => {
					if (current === null) return 0;
					return Math.min(current + 1, list.length - 1);
				});
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setSelected((current) => {
					if (current === null) return 0;
					return Math.max(current - 1, 0);
				});
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				const entry = selected !== null ? (entries?.[selected] ?? null) : null;
				if (entry !== null) {
					setSelected(selected);
					onCommitDiff(entry.hash);
					onDiff(null);
				}
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [tab, entries, selected, onCommitDiff, onDiff, setTab]);

	const select = useCallback((next: number) => {
		setSelected(next);
	}, []);

	return { entries, limit, loading, error, selected, load, select };
}
