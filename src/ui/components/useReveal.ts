import { useCallback, useEffect, useRef } from "react";
import { ancestorDirs, isInside } from "./revealTarget";

export function useReveal(
	root: string,
	activePath: string | null,
	revealToken: number | undefined,
	load: (path: string) => Promise<void>,
	setExpanded: (fn: (prev: Set<string>) => Set<string>) => void,
	setHighlightedPath: (v: string | null) => void,
	highlightTimer: { current: number | null },
) {
	// The reveal button bumps the token; the first render and a plain active-file change do not, so
	// mounting the app never steals focus from the editor.
	const lastToken = useRef<number | null>(null);

	const reveal = useCallback(
		async (target: string | null, moveFocus: boolean) => {
			if (target === null) return;
			if (!isInside(root, target)) return;
			const ancestors = ancestorDirs(root, target);
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
			requestAnimationFrame(() => {
				const row = document.querySelector(`[data-path="${CSS.escape(target)}"]`);
				if (!(row instanceof HTMLElement)) return;
				row.scrollIntoView({ block: "nearest" });
				// A revealed row is the keyboard's new roving position, so focus follows it.
				if (moveFocus) row.focus({ preventScroll: true });
			});
		},
		[root, load, setExpanded, setHighlightedPath, highlightTimer],
	);

	useEffect(() => {
		if (revealToken === undefined) return;
		const moveFocus = lastToken.current !== null && lastToken.current !== revealToken;
		lastToken.current = revealToken;
		void reveal(activePath, moveFocus);
	}, [revealToken, reveal, activePath]);

	return reveal;
}
