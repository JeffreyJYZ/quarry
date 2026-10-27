import type { DebugStatus } from "@/lib/debug/session";
import { DOCK_TABS, type DockTab } from "./parts";

/** Every tab's label; the record is exhaustive, so a new tab cannot ship unnamed. */
const LABELS: Record<DockTab, string> = {
	problems: "Problems",
	tests: "Tests",
	debugger: "Debugger",
	console: "Console",
	memory: "Memory",
};

export function DockTabs({
	expanded,
	onToggleExpanded,
	tab,
	onSelectTab,
	testsCount,
	failed,
	problemsErrors,
	debugStatus,
}: {
	expanded: boolean;
	onToggleExpanded: () => void;
	tab: DockTab;
	onSelectTab: (tab: DockTab) => void;
	testsCount: number;
	failed: number;
	problemsErrors: number;
	debugStatus: DebugStatus;
}) {
	/** The suffix each tab carries beside its name; console and memory have nothing to count. */
	function suffix(value: DockTab) {
		if (value === "tests") {
			return (
				<>
					<span className={failed > 0 ? "dock-tab-count bad" : "dock-tab-count"}>
						{testsCount}
					</span>
					{failed > 0 ? (
						<span className="dock-tab-count bad">{failed} failed</span>
					) : null}
				</>
			);
		}
		if (value === "problems") {
			return (
				<span className={problemsErrors > 0 ? "dock-tab-count bad" : "dock-tab-count"}>
					{problemsErrors}
				</span>
			);
		}
		if (value === "debugger") {
			return <span className={`dock-tab-status ${debugStatus}`}>{debugStatus}</span>;
		}
		return null;
	}

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
			<div className="dock-tabs">
				{DOCK_TABS.map((value) => (
					<button
						key={value}
						type="button"
						id={`dock-tab-${value}`}
						className={tab === value ? "dock-tab active" : "dock-tab"}
						aria-pressed={tab === value}
						onClick={() => onSelectTab(value)}
					>
						{LABELS[value]}
						{suffix(value)}
					</button>
				))}
			</div>
		</>
	);
}
