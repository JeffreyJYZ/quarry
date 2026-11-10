import type { DebugStatus } from "@/lib/debug/session";
import { useDockOverflow } from "@/ui/app/useDockOverflow";
import { DOCK_TAB_LABELS, DockTabSuffix, type DockTabCounts } from "./DockTabSuffix";
import { DockOverflowMenu } from "./DockOverflowMenu";
import { DOCK_TABS, type DockTab } from "./parts";

export function DockTabs({
	expanded,
	onToggleExpanded,
	tab,
	onSelectTab,
	testsCount,
	failed,
	problemsErrors,
	todoCount,
	bookmarksCount,
	debugStatus,
	runStatus,
}: {
	expanded: boolean;
	onToggleExpanded: () => void;
	tab: DockTab;
	onSelectTab: (tab: DockTab) => void;
	testsCount: number;
	failed: number;
	problemsErrors: number;
	/** How many markers the TODO scan is holding, so the tab says it while collapsed. */
	todoCount: number;
	/** How many bookmarks this project holds, so the tab says it while collapsed. */
	bookmarksCount: number;
	debugStatus: DebugStatus;
	/** The run tab's suffix: `running`, the exit code, or nothing before the first run. */
	runStatus: string | null;
}) {
	const counts: DockTabCounts = {
		testsCount,
		failed,
		problemsErrors,
		todoCount,
		bookmarksCount,
		debugStatus,
		runStatus,
	};
	// Anything a tab's suffix reads is a width it can grow by, and the tab's own ResizeObserver
	// reports that, so the strip never needs to guess which count moved.
	const overflow = useDockOverflow({ tabs: DOCK_TABS, active: tab });
	// The active tab is never fitted away, but a stale measurement must not park it either.
	const parked = new Set(overflow.hidden.filter((value) => value !== tab));

	return (
		<>
			<button
				type="button"
				className="dock-toggle"
				aria-expanded={expanded}
				aria-label={expanded ? "Collapse dock" : "Expand dock"}
				onClick={onToggleExpanded}
			>
				<span
					className={expanded ? "problems-caret open" : "problems-caret"}
					aria-hidden="true"
				/>
			</button>
			<div className="dock-tabs" ref={overflow.rowRef}>
				{DOCK_TABS.map((value) => {
					const away = parked.has(value);
					const active = tab === value;
					return (
						<button
							key={value}
							type="button"
							ref={(node) => overflow.register(value, node)}
							id={`dock-tab-${value}`}
							className={
								away ? "dock-tab parked" : active ? "dock-tab active" : "dock-tab"
							}
							aria-pressed={active}
							aria-hidden={away || undefined}
							tabIndex={away ? -1 : undefined}
							onClick={() => onSelectTab(value)}
						>
							{DOCK_TAB_LABELS[value]}
							<DockTabSuffix tab={value} {...counts} />
						</button>
					);
				})}
				{overflow.overflow ? (
					<DockOverflowMenu
						hidden={overflow.hidden}
						onSelectTab={onSelectTab}
						triggerRef={overflow.moreRef}
						{...counts}
					/>
				) : null}
			</div>
		</>
	);
}
