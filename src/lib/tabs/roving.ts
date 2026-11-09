/**
 * The keyboard model both tab strips share.
 *
 * A tablist is one roving tab stop: arrows step and wrap, Home and End jump to the ends, and
 * Enter or Space activates the tab that holds focus. Walks take the strip's own order, so the keys
 * follow what the user sees.
 */

const NEXT = new Set(["ArrowRight", "ArrowDown"]);
const PREVIOUS = new Set(["ArrowLeft", "ArrowUp"]);

/** The tab a navigation key lands on, or null when the key is not navigation. */
export function rovingIndex(key: string, current: number, count: number): number | null {
	if (count <= 0) return null;
	const index = current < 0 || current >= count ? 0 : current;
	if (NEXT.has(key)) return (index + 1) % count;
	if (PREVIOUS.has(key)) return (index - 1 + count) % count;
	if (key === "Home") return 0;
	if (key === "End") return count - 1;
	return null;
}

/** Enter and Space activate a focused tab, matching a button's own activation keys. */
export function isTabActivation(key: string): boolean {
	return key === "Enter" || key === " ";
}
