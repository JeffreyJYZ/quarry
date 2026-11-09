/** The selected row, kept inside the list that is actually on screen. */
export function clampActive(active: number, length: number): number {
	if (length <= 0) return 0;
	return Math.max(0, Math.min(active, length - 1));
}
