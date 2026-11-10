/**
 * Which dock tabs fit on one row, and which ones the `»` menu has to hold.
 *
 * Pure on purpose: the widths come from layout, the decision does not, so the rule is testable
 * without a browser. The active tab is always visible, even when it alone is wider than the row,
 * because a tab strip that hides the panel you are looking at is worse than a wide one.
 */

export type DockFit<T extends string = string> = {
	/** The tabs in the row, in the order they were given. */
	visible: T[];
	/** The tabs the overflow menu lists, in the same order. */
	hidden: T[];
	/** Whether a `»` button is needed at all. */
	overflow: boolean;
};

export function fitDockTabs<T extends string>(input: {
	/** Every tab, in display order. */
	tabs: readonly T[];
	/** Each tab's natural width, measured with its label and its suffix. */
	widths: ReadonlyMap<T, number>;
	/** The tab the dock is showing; it is never hidden. */
	active: T;
	/** The row's own width. */
	available: number;
	/** The width the `»` button needs, including nothing else. */
	overflowWidth: number;
	/** The space between two neighbours in the row. */
	gap?: number;
}): DockFit<T> {
	const gap = input.gap ?? 0;
	const { tabs } = input;
	if (tabs.length === 0) {
		return { visible: [], hidden: [], overflow: false };
	}

	const widths = tabs.map((tab) => Math.max(0, input.widths.get(tab) ?? 0));
	const total = widths.reduce((sum, width, index) => sum + width + (index === 0 ? 0 : gap), 0);
	if (total <= input.available) {
		return { visible: [...tabs], hidden: [], overflow: false };
	}

	// The button takes its own width and a gap, and the active tab's slot is reserved before the
	// others are placed, so the visible row never has to push it out to make room for them.
	const activeWidth = Math.max(0, input.widths.get(input.active) ?? 0);
	let remaining = input.available - input.overflowWidth - gap * 2 - activeWidth;
	const visible: T[] = [];
	const hidden: T[] = [];
	for (const [index, tab] of tabs.entries()) {
		if (tab === input.active) {
			visible.push(tab);
			continue;
		}
		const cost = (widths[index] ?? 0) + (visible.length === 0 ? 0 : gap);
		if (cost <= remaining) {
			visible.push(tab);
			remaining -= cost;
			continue;
		}
		hidden.push(tab);
	}
	return { visible, hidden, overflow: hidden.length > 0 };
}
