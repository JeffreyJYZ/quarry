import type { ProblemFile } from "@/lib/problems/model";
import type { FileBuffer } from "@/lib/project/buffer";
import type { DebugController } from "@/lib/debug/session";
import type { RunControls } from "@/ui/app/runControlsTypes";
import { DockTabs } from "./DockTabs";
import { DockTools } from "./DockTools";
import { runTabStatus } from "./parts";
import { useDockFilters } from "./useDockFilters";
import RunDock from "./RunDock";
import ConsoleSection from "@/ui/debug/ConsoleSection";
import MemoryPanes from "@/ui/debug/MemoryPanes";
import DebugDockBody from "@/ui/debug/dock/DebugDockBody";
import DebugMenu from "@/ui/debug/dock/DebugMenu";
import { memoryAddressOf } from "@/ui/debug/dock/addresses";
import ProblemsPanel from "@/ui/problems/ProblemsPanel";
import TestsPanel from "@/ui/tests/TestsPanel";
import type { TestsController } from "@/lib/tests/useTests";
import "@/ui/debug/dock/dock-debug.css";
import "@/ui/debug/debug.css";

export type DockTab = import("./parts").DockTab;

export type TestsDockProps = {
	tab: DockTab;
	expanded: boolean;
	onToggleExpanded: () => void;
	onSelectTab: (tab: DockTab) => void;
	debug: DebugController;
	activePath: string | null;
	cursor: { line: number; character: number } | null;
	onNavigate: (path: string, line: number, character: number) => void;
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
	runs: RunControls;
};

/** The bottom dock: diagnostics, tests and the debug session's own views share one header. */
export default function TestsDock({
	tab,
	expanded,
	onToggleExpanded,
	onSelectTab,
	debug,
	activePath,
	cursor,
	onNavigate,
	problems,
	tests,
	runs,
}: TestsDockProps) {
	const dock = useDockFilters({ tests, tab, expanded });
	const bodyClass =
		tab === "debugger"
			? "dock-body dock-body-debug"
			: tab === "run"
				? "dock-body dock-body-run"
				: "dock-body";

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
					debugStatus={debug.status}
					runStatus={runTabStatus({
						running: runs.running !== null,
						exited: runs.exited,
					})}
				/>
				{tab === "tests" ? <DockTools dock={dock} tests={tests} /> : null}
				{tab === "debugger" ? <DebugMenu debug={debug} /> : null}
			</div>
			{expanded ? (
				<div className={bodyClass}>
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
					) : tab === "problems" ? (
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
					) : tab === "debugger" ? (
						<DebugDockBody
							debug={debug}
							activePath={activePath}
							cursor={cursor}
							onNavigate={onNavigate}
						/>
					) : tab === "run" ? (
						<RunDock runs={runs} />
					) : tab === "console" ? (
						<ConsoleSection session={debug.sessionId} />
					) : (
						<MemoryPanes
							session={debug.sessionId}
							memoryAddress={memoryAddressOf(debug)}
						/>
					)}
				</div>
			) : null}
		</section>
	);
}
