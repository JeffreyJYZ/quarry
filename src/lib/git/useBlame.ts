import { useCallback, useEffect, useState } from "react";
import { gitBlame } from "@/lib/project/api";
import type { BlameLine } from "@/lib/project/api";
import { describeError } from "@/lib/project/errors";
import type { GitPanelTab } from "@/lib/git/useHistory";

type BlameOptions = {
	root: string;
	tab: GitPanelTab;
	activePath: string | null;
	saveToken?: number;
};

/** Owns the per-file blame cache, its lazy load and the collapsed group set. */
export function useBlame({ root, tab, activePath, saveToken }: BlameOptions) {
	const [cache, setCache] = useState<Map<string, BlameLine[]>>(() => new Map());
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());

	// Load blame lazily for the active file.
	useEffect(() => {
		if (tab !== "blame") return;
		if (activePath === null) return;
		const cached = cache.get(activePath);
		if (cached !== undefined) {
			setError(null);
			return;
		}
		let cancelled = false;
		setLoading(true);
		setError(null);
		void (async () => {
			try {
				const result = await gitBlame(root, activePath);
				if (cancelled) return;
				setCache((current) => {
					const next = new Map(current);
					next.set(activePath, result);
					return next;
				});
			} catch (err) {
				if (cancelled) return;
				setError(describeError(err));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [tab, activePath, root, cache]);

	// Refetch after save.
	useEffect(() => {
		if (saveToken === undefined) return;
		if (activePath === null) return;
		setCache((current) => {
			const next = new Map(current);
			next.delete(activePath);
			return next;
		});
		setCollapsed(new Set());
		if (tab === "blame") {
			// trigger reload by toggling loading
			setLoading(true);
		}
	}, [saveToken, activePath, tab]); // eslint-disable-line react-hooks/exhaustive-deps

	const toggleGroup = useCallback((index: number) => {
		setCollapsed((current) => {
			const next = new Set(current);
			if (next.has(index)) next.delete(index);
			else next.add(index);
			return next;
		});
	}, []);

	return { cache, loading, error, collapsed, toggleGroup };
}
