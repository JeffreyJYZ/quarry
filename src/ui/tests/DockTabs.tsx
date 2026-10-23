export function DockTabs({
	expanded,
	onToggleExpanded,
	tab,
	onSelectTab,
	testsCount,
	failed,
	problemsErrors,
}: {
	expanded: boolean;
	onToggleExpanded: () => void;
	tab: "tests" | "problems";
	onSelectTab: (tab: "tests" | "problems") => void;
	testsCount: number;
	failed: number;
	problemsErrors: number;
}) {
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
				<button
					type="button"
					className={tab === "tests" ? "dock-tab active" : "dock-tab"}
					aria-pressed={tab === "tests"}
					onClick={() => onSelectTab("tests")}
				>
					Tests
					<span className={failed > 0 ? "dock-tab-count bad" : "dock-tab-count"}>
						{testsCount}
					</span>
					{failed > 0 ? (
						<span className="dock-tab-count bad">{failed} failed</span>
					) : null}
				</button>
				<button
					type="button"
					className={tab === "problems" ? "dock-tab active" : "dock-tab"}
					aria-pressed={tab === "problems"}
					onClick={() => onSelectTab("problems")}
				>
					Problems
					<span className={problemsErrors > 0 ? "dock-tab-count bad" : "dock-tab-count"}>
						{problemsErrors}
					</span>
				</button>
			</div>
		</>
	);
}
