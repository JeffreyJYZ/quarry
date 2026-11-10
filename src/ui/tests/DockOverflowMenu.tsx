import { type RefObject, useEffect, useRef, useState } from "react";
import { DOCK_TAB_LABELS, DockTabSuffix, type DockTabCounts } from "./DockTabSuffix";
import type { DockTab } from "./parts";

/**
 * The `»` button and the tabs the row could not fit.
 *
 * The menu is positioned by `.dock-overflow` rather than by the row, so a narrow dock narrows the
 * button's slot without clipping the list that drops out of it.
 */
export function DockOverflowMenu({
	hidden,
	onSelectTab,
	triggerRef,
	...counts
}: {
	hidden: DockTab[];
	onSelectTab: (tab: DockTab) => void;
	/** The hook measures this button, so it owns the ref when it has one. */
	triggerRef?: RefObject<HTMLButtonElement | null>;
} & DockTabCounts) {
	const [open, setOpen] = useState(false);
	const localTrigger = useRef<HTMLButtonElement | null>(null);
	const trigger = triggerRef ?? localTrigger;
	const root = useRef<HTMLDivElement | null>(null);
	const menu = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open) return;
		menu.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
		const onPointerDown = (event: MouseEvent) => {
			if (root.current !== null && !root.current.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", onPointerDown);
		return () => document.removeEventListener("mousedown", onPointerDown);
	}, [open]);

	if (hidden.length === 0) return null;

	return (
		<div className="dock-overflow" ref={root}>
			<button
				type="button"
				className="dock-tab-more"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-label="More dock tabs"
				title="Tabs that do not fit"
				ref={trigger}
				onClick={() => setOpen(!open)}
			>
				»
			</button>
			{open ? (
				<div
					className="dock-overflow-menu"
					role="menu"
					aria-label="More dock tabs"
					ref={menu}
					onKeyDown={(event) => {
						if (event.key !== "Escape") return;
						event.preventDefault();
						setOpen(false);
						trigger.current?.focus();
					}}
				>
					{hidden.map((value) => (
						<button
							key={value}
							type="button"
							role="menuitem"
							className="dock-overflow-item"
							onClick={() => {
								onSelectTab(value);
								setOpen(false);
							}}
						>
							{DOCK_TAB_LABELS[value]}
							<DockTabSuffix tab={value} {...counts} />
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}
