/**
 * Which buffer a Ctrl+Tab lands on.
 *
 * The list is the tab strip's own order, so cycling follows what the user sees rather than the order
 * files were opened. A closed tab leaves no gap: the index comes from the current list each time.
 */
export function nextTabPath(
	buffers: readonly { path: string }[],
	active: string | null,
	step: number,
): string | null {
	if (buffers.length === 0) return null;
	const current = buffers.findIndex((buffer) => buffer.path === active);
	if (current === -1) return buffers[0].path;
	const count = buffers.length;
	// Modulo that keeps a negative step inside the list, so previous from the first wraps to the last.
	const next = (((current + step) % count) + count) % count;
	return buffers[next].path;
}
