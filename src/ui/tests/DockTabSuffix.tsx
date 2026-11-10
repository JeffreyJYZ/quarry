import type { DebugStatus } from "@/lib/debug/session";
import type { DockTab } from "./parts";

/** Every tab's label; the record is exhaustive, so a new tab cannot ship unnamed. */
export const DOCK_TAB_LABELS: Record<DockTab, string> = {
	problems: "Problems",
	bookmarks: "Bookmarks",
	tests: "Tests",
	run: "Run",
	debugger: "Debugger",
	console: "Console",
	memory: "Memory",
	todo: "TODO",
};

/** What each tab says beside its name, and what the row and the overflow menu both have to show. */
export type DockTabCounts = {
	testsCount: number;
	failed: number;
	problemsErrors: number;
	todoCount: number;
	bookmarksCount: number;
	debugStatus: DebugStatus;
	/** The run tab's suffix: `running`, the exit code, or nothing before the first run. */
	runStatus: string | null;
};

/** The suffix each tab carries beside its name; console and memory have nothing to count. */
export function DockTabSuffix({ tab, ...counts }: { tab: DockTab } & DockTabCounts) {
	if (tab === "tests") {
		return (
			<>
				<span className={counts.failed > 0 ? "dock-tab-count bad" : "dock-tab-count"}>
					{counts.testsCount}
				</span>
				{counts.failed > 0 ? (
					<span className="dock-tab-count bad">{counts.failed} failed</span>
				) : null}
			</>
		);
	}
	if (tab === "problems") {
		return (
			<span className={counts.problemsErrors > 0 ? "dock-tab-count bad" : "dock-tab-count"}>
				{counts.problemsErrors}
			</span>
		);
	}
	if (tab === "todo") {
		return <span className="dock-tab-count">{counts.todoCount}</span>;
	}
	if (tab === "bookmarks") {
		return <span className="dock-tab-count">{counts.bookmarksCount}</span>;
	}
	if (tab === "debugger") {
		return (
			<span className={`dock-tab-status ${counts.debugStatus}`}>{counts.debugStatus}</span>
		);
	}
	if (tab === "run") {
		if (counts.runStatus === null) {
			return null;
		}
		return (
			<span
				className={
					counts.runStatus === "running" ? "dock-tab-status running" : "dock-tab-status"
				}
			>
				{counts.runStatus}
			</span>
		);
	}
	return null;
}
