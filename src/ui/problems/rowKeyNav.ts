import type { KeyboardEvent, RefObject } from "react";

/**
 * Arrow keys move between problem rows, and focus follows the selection.
 *
 * The handler belongs to the row, not to a focusable wrapper: the rows are buttons, so a wrapper
 * with `tabIndex` was a static element doing an interactive job, and the focus ring sat on a box
 * that contained the row the user was actually on. Enter stays the button's own click.
 */
export function rowKeyNav(
	count: number,
	rowRefs: RefObject<(HTMLButtonElement | null)[]>,
	setSelected: (next: number) => void,
) {
	return (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
		if (count === 0) return;
		if (event.key === "ArrowDown") {
			event.preventDefault();
			const next = Math.min(index + 1, count - 1);
			setSelected(next);
			rowRefs.current[next]?.focus();
			return;
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			const next = Math.max(index - 1, 0);
			setSelected(next);
			rowRefs.current[next]?.focus();
		}
	};
}
