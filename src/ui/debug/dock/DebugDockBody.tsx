import BreakpointsSection from "@/ui/debug/BreakpointsSection";
import CallStackList from "@/ui/debug/CallStackList";
import EvaluateField from "@/ui/debug/dock/EvaluateField";
import VariablesSection from "@/ui/debug/VariablesSection";
import { PinsSection, WatchPointsSection } from "@/ui/debug/WatchSections";
import TransportRail from "@/ui/debug/dock/TransportRail";
import Splitter from "@/ui/layout/Splitter";
import { useDebugDockWidths } from "@/ui/debug/dock/dockWidths";
import type { DebugController } from "@/lib/debug/session";

/**
 * The debugger tab: an icon transport rail, then Frames, Variables + Watches and Breakpoints.
 *
 * The column headers replace the old stacked `debug-section` chrome; the row above them is the one
 * place a session fact, a launch error and the build offer appear, so nothing is buried.
 */
export default function DebugDockBody({
	debug,
	activePath,
	cursor,
	onNavigate,
}: {
	debug: DebugController;
	activePath: string | null;
	cursor: { line: number; character: number } | null;
	onNavigate: (path: string, line: number, character: number) => void;
}) {
	const view = debug.stopView;
	const top = view === null ? null : (view.frames[0] ?? null);
	const { framesWidth, setFramesWidth, breakpointsWidth, setBreakpointsWidth } =
		useDebugDockWidths();
	const canAddBreakpoint = debug.status === "stopped" && top !== null && top.source !== null;
	const offer = debug.error ?? debug.profileMismatch ?? debug.buildNeeded;
	const session =
		debug.sessionKind === null
			? null
			: [debug.sessionKind, debug.sessionBuildProfile, debug.restarted ? "(restarted)" : null]
					.filter((part) => part !== null)
					.join(" · ");

	return (
		<div className="dock-debug">
			{/*
			 * The strip is always drawn, empty or not. It is the row that shifts every column below it,
			 * so a version that only appeared on an error or a session made the column headers jump the
			 * moment a stop arrived or the tab was revisited.
			 */}
			<div className={debug.error === null ? "dock-debug-strip" : "dock-debug-strip error"}>
				<span className="dock-debug-strip-text" title={offer ?? undefined}>
					{offer ?? session ?? "no debug session"}
				</span>
				{debug.buildNeeded === null ? null : (
					<button
						type="button"
						className="dock-action"
						disabled={debug.building}
						onClick={debug.buildNow}
					>
						{debug.building ? "Building…" : "Build now"}
					</button>
				)}
			</div>
			<div className="dock-debug-grid">
				<TransportRail debug={debug} activePath={activePath} cursor={cursor} />

				<section
					className="dock-debug-col"
					aria-label="Frames"
					style={{ flex: "0 0 auto", width: `${framesWidth}px` }}
				>
					<header className="dock-debug-head">
						<span className="dock-debug-label">frames</span>
						<span className="dock-debug-count">
							{view === null ? 0 : view.frames.length}
						</span>
					</header>
					<div className="dock-debug-scroll">
						<CallStackList debug={debug} view={view} onNavigate={onNavigate} />
					</div>
				</section>

				<Splitter
					axis="x"
					value={framesWidth}
					min={120}
					max={420}
					label="Resize frames"
					onChange={setFramesWidth}
				/>

				<section
					className="dock-debug-col"
					aria-label="Variables and watches"
					style={{ flex: "1 1 auto", minWidth: 0 }}
				>
					<header className="dock-debug-head">
						<span className="dock-debug-label">variables</span>
						<span className="dock-debug-count">
							{view === null ? 0 : view.scopes.length}
						</span>
					</header>
					<EvaluateField debug={debug} view={view} />
					<div className="dock-debug-scroll">
						<VariablesSection debug={debug} view={view} />
					</div>
					<header className="dock-debug-head dock-debug-head-sub">
						<span className="dock-debug-label">watch</span>
						<span className="dock-debug-count">{debug.pins.length}</span>
					</header>
					<div className="dock-debug-scroll dock-debug-scroll-watch">
						<PinsSection debug={debug} />
						<WatchPointsSection debug={debug} />
					</div>
				</section>

				<Splitter
					axis="x"
					value={breakpointsWidth}
					min={160}
					max={420}
					invert
					label="Resize breakpoints"
					onChange={setBreakpointsWidth}
				/>

				<section
					className="dock-debug-col"
					aria-label="Breakpoints"
					style={{ flex: "0 0 auto", width: `${breakpointsWidth}px` }}
				>
					<header className="dock-debug-head">
						<span className="dock-debug-label">breakpoints</span>
						<button
							type="button"
							className="dock-action"
							disabled={!canAddBreakpoint}
							title={
								canAddBreakpoint
									? "Use the top frame's file and line"
									: "Stop first"
							}
							onClick={debug.addBreakpoint}
						>
							Add
						</button>
					</header>
					<div className="dock-debug-scroll">
						<BreakpointsSection debug={debug} />
					</div>
				</section>
			</div>
		</div>
	);
}
