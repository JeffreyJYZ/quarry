import { useState } from "react";
import BreakpointsSection from "@/ui/debug/BreakpointsSection";
import CallStackList from "@/ui/debug/CallStackList";
import ControlsSection from "@/ui/debug/ControlsSection";
import ExceptionsSection from "@/ui/debug/ExceptionsSection";
import LaunchSection from "@/ui/debug/LaunchSection";
import MemoryPanes from "@/ui/debug/MemoryPanes";
import PresetsEditor from "@/ui/debug/PresetsEditor";
import VariablesSection from "@/ui/debug/VariablesSection";
import { PinsSection, WatchPointsSection } from "@/ui/debug/WatchSections";
import type { DebugController, StopView } from "@/lib/debug/session";

/**
 * The right-hand debugger column: presets and launch, transport controls, stack, variables, watch
 * points, breakpoints and the memory/disassembly panes. It renders state; the hook does the work.
 */
export default function DebugPanel({
	debug,
	activePath = null,
	cursor = null,
	onNavigate,
}: {
	debug: DebugController;
	activePath?: string | null;
	cursor?: { line: number; character: number } | null;
	onNavigate?: (path: string, line: number, character: number) => void;
}) {
	const view: StopView | null = debug.stopView;
	const top = view === null ? null : (view.frames[0] ?? null);
	const activeFrame =
		view === null ? null : (view.frames.find((frame) => frame.id === view.frameId) ?? top);
	const memoryAddress =
		debug.selectedVariable?.memoryReference ?? activeFrame?.instructionPointer ?? null;
	const disasmAddress = activeFrame?.instructionPointer ?? null;
	const canAddBreakpoint = debug.status === "stopped" && top !== null && top.source !== null;

	const [editingPresets, setEditingPresets] = useState(false);
	/** Bumped per "Edit presets" click so a re-open re-seeds the drafts, as the old open did. */
	const [editorSession, setEditorSession] = useState(0);

	function openEditor() {
		setEditorSession((value) => value + 1);
		setEditingPresets(true);
	}

	return (
		<aside className="debug" aria-label="Debugger">
			<div className="debug-head">
				<span className="label">debug</span>
				<span className={`debug-status ${debug.restarting ? "dimmed" : debug.status}`}>
					{debug.restarting ? "restarting…" : debug.status}
				</span>
				{debug.sessionKind === null ? null : (
					<span className="debug-session">
						{debug.sessionKind}
						{debug.sessionBuildProfile === null
							? ""
							: ` · ${debug.sessionBuildProfile}`}
						{debug.restarted ? " (restarted)" : ""}
					</span>
				)}
			</div>

			{debug.error === null ? null : (
				<p className="debug-error" role="status">
					{debug.error}
				</p>
			)}
			{debug.profileMismatch === null ? null : (
				<p className="debug-error" role="status">
					{debug.profileMismatch}
				</p>
			)}
			{debug.buildNeeded === null ? null : (
				<div className="debug-row">
					<button
						type="button"
						className="button"
						disabled={debug.building}
						onClick={debug.buildNow}
					>
						{debug.building ? "Building…" : "Build now"}
					</button>
				</div>
			)}

			<LaunchSection debug={debug} onEditPresets={openEditor} />

			{editingPresets ? (
				<PresetsEditor
					key={editorSession}
					debug={debug}
					onClose={() => setEditingPresets(false)}
				/>
			) : null}

			<ControlsSection debug={debug} activePath={activePath} cursor={cursor} />
			<CallStackList debug={debug} view={view} onNavigate={onNavigate} />
			<VariablesSection debug={debug} view={view} />
			<PinsSection debug={debug} />
			<WatchPointsSection debug={debug} />
			<BreakpointsSection debug={debug} canAddBreakpoint={canAddBreakpoint} />
			<ExceptionsSection debug={debug} session={debug.sessionId} />
			<MemoryPanes
				session={debug.sessionId}
				memoryAddress={memoryAddress}
				disasmAddress={disasmAddress}
			/>
		</aside>
	);
}
