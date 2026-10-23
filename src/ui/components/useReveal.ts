import { useCallback, useEffect } from "react";

export function useReveal(
	root: string,
	activePath: string | null,
	revealToken: number | undefined,
	load: (path: string) => Promise<void>,
	setExpanded: (fn: (prev: Set<string>) => Set<string>) => void,
	setHighlightedPath: (v: string | null) => void,
	highlightTimer: { current: number | null },
) {
	const reveal = useCallback(
		async (target: string | null) => {
			if (target === null) return;
			if (!target.startsWith(`${root}/`)) return;
			const parts = target
				.slice(root.length + 1)
				.split("/")
				.filter((p) => p.length > 0);
			let current = root;
			const ancestors: string[] = [];
			for (const part of parts.slice(0, -1)) {
				current = `${current}/${part}`;
				if (current !== root) ancestors.push(current);
			}
			try {
				for (const dir of ancestors) await load(dir);
			} catch {
				return;
			}
			setExpanded((prev) => {
				const next = new Set(prev);
				for (const dir of ancestors) next.add(dir);
				return next;
			});
			setHighlightedPath(target);
			if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
			highlightTimer.current = window.setTimeout(() => {
				setHighlightedPath(null);
				highlightTimer.current = null;
			}, 1500);
			window.setTimeout(() => {
				const row = document.querySelector(`[data-path="${CSS.escape(target)}"]`);
				if (row instanceof HTMLElement) row.scrollIntoView({ block: "nearest" });
			}, 0);
		},
		[root, load, setExpanded, setHighlightedPath, highlightTimer],
	);

	useEffect(() => {
		if (revealToken === undefined) return;
		void reveal(activePath);
	}, [revealToken, reveal, activePath]);

	return reveal;
}
