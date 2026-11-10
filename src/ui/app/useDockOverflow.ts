import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type DockFit, fitDockTabs } from "@/lib/dock/fit";
import type { DockTab } from "@/ui/tests/parts";

/** The space `.dock-tabs` leaves between two neighbours. */
const TAB_GAP = 2;

/** The `»` button's width before it has ever mounted, which is only the first measurement. */
const MORE_WIDTH = 26;

export type DockOverflow = DockFit<DockTab> & {
	/** The tab row, whose width is the space the tabs have. */
	rowRef: RefObject<HTMLDivElement | null>;
	/** The `»` button, so its measured width can be reserved. */
	moreRef: RefObject<HTMLButtonElement | null>;
	/** Attach to each tab: the hook measures it and keeps it out of the flow when it is hidden. */
	register: (tab: DockTab, node: HTMLButtonElement | null) => void;
};

/**
 * Which dock tabs fit, measured from the row and the tabs themselves.
 *
 * When nothing can be measured — a test DOM, a first paint, a zero-width pane — every tab is shown:
 * hiding one because the environment cannot measure it would make the dock lose features silently.
 */
export function useDockOverflow(input: {
	tabs: readonly DockTab[];
	active: DockTab;
}): DockOverflow {
	const { tabs, active } = input;
	const rowRef = useRef<HTMLDivElement | null>(null);
	const moreRef = useRef<HTMLButtonElement | null>(null);
	const nodes = useRef(new Map<DockTab, HTMLButtonElement>());
	const [fit, setFit] = useState<DockFit<DockTab>>({
		visible: [...tabs],
		hidden: [],
		overflow: false,
	});

	const measure = useCallback(() => {
		const row = rowRef.current;
		if (row === null) return;
		const available = row.clientWidth;
		const widths = new Map<DockTab, number>();
		let measurable = available > 0;
		for (const tab of tabs) {
			const width = nodes.current.get(tab)?.offsetWidth ?? 0;
			if (width <= 0) measurable = false;
			widths.set(tab, width);
		}
		if (!measurable) {
			setFit({ visible: [...tabs], hidden: [], overflow: false });
			return;
		}
		const measured = moreRef.current?.offsetWidth ?? 0;
		setFit(
			fitDockTabs({
				tabs,
				widths,
				active,
				available,
				overflowWidth: measured > 0 ? measured : MORE_WIDTH,
				gap: TAB_GAP,
			}),
		);
	}, [tabs, active]);

	// Before the paint, so a resize never shows a half-fitted row. A count that grows a tab is a
	// resize of that tab, which the observer reports; this covers the first render and the active tab.
	useLayoutEffect(() => {
		measure();
	}, [measure]);

	useEffect(() => {
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => measure());
		if (rowRef.current !== null) observer.observe(rowRef.current);
		for (const node of nodes.current.values()) observer.observe(node);
		// The button mounts only once something overflowed, so its real width is measured from
		// then on rather than assumed.
		if (fit.overflow && moreRef.current !== null) observer.observe(moreRef.current);
		return () => observer.disconnect();
	}, [measure, fit.overflow]);

	const register = useCallback((tab: DockTab, node: HTMLButtonElement | null) => {
		if (node === null) {
			nodes.current.delete(tab);
			return;
		}
		nodes.current.set(tab, node);
	}, []);

	return { ...fit, rowRef, moreRef, register };
}
