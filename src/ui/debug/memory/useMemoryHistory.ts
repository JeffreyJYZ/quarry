import { useCallback, useState } from "react";

/** History of visited addresses with back/forward navigation and a 20-entry cap. */
export function useMemoryHistory(navigate: (next: bigint) => void) {
	const [history, setHistory] = useState<bigint[]>([]);
	const [historyIndex, setHistoryIndex] = useState(-1);

	const recordVisit = useCallback(
		(next: bigint) => {
			setHistory((previous) => {
				const base = previous.slice(0, historyIndex + 1);
				if (base.length > 0 && base[base.length - 1] === next) {
					return previous;
				}
				// Drop any earlier occurrence so the list stays deduped.
				const deduped = base.filter((entry) => entry !== next);
				const nextHistory = [...deduped, next];
				const sliced =
					nextHistory.length > 20
						? nextHistory.slice(nextHistory.length - 20)
						: nextHistory;
				setHistoryIndex(sliced.length - 1);
				return sliced;
			});
		},
		[historyIndex],
	);

	const goBack = () => {
		if (historyIndex <= 0) {
			return;
		}
		const nextIndex = historyIndex - 1;
		setHistoryIndex(nextIndex);
		navigate(history[nextIndex]);
	};

	const goForward = () => {
		if (historyIndex >= history.length - 1) {
			return;
		}
		const nextIndex = historyIndex + 1;
		setHistoryIndex(nextIndex);
		navigate(history[nextIndex]);
	};

	return { history, historyIndex, recordVisit, goBack, goForward };
}
