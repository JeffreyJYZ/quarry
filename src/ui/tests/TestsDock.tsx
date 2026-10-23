import type { ProblemFile } from "@/lib/problems/model";
import type { FileBuffer } from "@/lib/project/buffer";
import { DockTabs } from "./DockTabs";
import { DockTools } from "./DockTools";
import { useDockFilters } from "./useDockFilters";
import ProblemsPanel from "@/ui/problems/ProblemsPanel";
import TestsPanel from "@/ui/tests/TestsPanel";
import type { TestsController } from "@/lib/tests/useTests";

export type DockTab = import("./parts").DockTab;

export type TestsDockProps = {
	tab: DockTab;
	expanded: boolean;
	onToggleExpanded: () => void;
	onSelectTab: (tab: DockTab) => void;
	problems: {
		files: ProblemFile[];
		errors: number;
		warnings: number;
		activePath: string | null;
		onSelect: (path: string, line?: number, character?: number) => void;
		root: string | null;
		buffers: FileBuffer[];
		setBuffers: (updater: (current: FileBuffer[]) => FileBuffer[]) => void;
	};
	tests: TestsController;
};

export default function TestsDock({
	tab,
	expanded,
	onToggleExpanded,
	onSelectTab,
	problems,
	tests,
}: TestsDockProps) {
	const dock = useDockFilters({ tests, tab, expanded });
	return (
		<section className={expanded ? "dock" : "dock collapsed"} aria-label="Bottom dock">
			<div className="dock-head">
				<DockTabs
					expanded={expanded}
					onToggleExpanded={onToggleExpanded}
					tab={tab}
					onSelectTab={onSelectTab}
					testsCount={tests.items.length}
					failed={dock.failed}
					problemsErrors={problems.errors}
				/>
				{tab === "tests" ? <DockTools dock={dock} tests={tests} /> : null}
			</div>
			{expanded ? (
				<div className="dock-body">
					{tab === "tests" ? (
						<TestsPanel
							items={dock.filtered}
							totalCount={tests.items.length}
							loading={tests.loading}
							loadError={tests.loadError}
							results={tests.results}
							running={tests.running}
							summary={tests.summary}
							collapsedGroups={dock.collapsedGroups}
							onToggleGroup={dock.toggleGroup}
							highlighted={dock.highlighted}
							onRun={tests.runOne}
							textFilter={dock.filter}
							binaryFilter={dock.binaryFilter}
							resultFilter={dock.resultFilter}
						/>
					) : (
						<ProblemsPanel
							files={problems.files}
							errors={problems.errors}
							warnings={problems.warnings}
							open
							onToggle={onToggleExpanded}
							onSelect={problems.onSelect}
							activePath={problems.activePath}
							root={problems.root}
							buffers={problems.buffers}
							setBuffers={problems.setBuffers}
						/>
					)}
				</div>
			) : null}
		</section>
	);
}
