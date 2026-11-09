import { useCallback, useEffect, useRef } from "react";

/**
 * A callback whose identity never changes while it always runs the latest closure.
 *
 * A memoised row compares its props by identity, so a callback rebuilt on every parent render
 * defeats the memo and drags every row through a re-render. The latest closure is kept in a ref and
 * refreshed after each commit, which hands children one function for the life of the component
 * without freezing the state that function reads.
 */
export function useStableCallback<A extends readonly unknown[]>(
	callback: (...args: A) => void,
): (...args: A) => void {
	const latest = useRef(callback);
	useEffect(() => {
		latest.current = callback;
	}, [callback]);
	return useCallback((...args: A) => latest.current(...args), []);
}
