import { Suspense, lazy } from "react";
import CallsPanel from "@/ui/calls/CallsPanel";
import TypeHierarchyPanel from "@/ui/lsp/TypeHierarchyPanel";
import BottomDock from "@/ui/app/BottomDock";
import Splitter from "@/ui/layout/Splitter";
import type { ShellModel } from "@/ui/app/useShell";

const Terminal = lazy(() => import("@/ui/terminal/Terminal"));

/**
 * The slot under the editor: the terminal, the call hierarchy, the type hierarchy or the bottom
 * dock. They are exclusive, in that order — the terminal wins while it is open at the bottom.
 */
export default function CanvasPanels({ model }: { model: ShellModel }) {
	const { workspace, overlays, panels, settings, diagnostics } = model;
	const { project } = workspace;
	const terminalHeight = settings.panels.terminalHeight;

	if (
		project !== null &&
		panels.terminalOpen &&
		settings.effective.terminalPlacement === "bottom"
	) {
		return (
			<>
				<Splitter
					axis="y"
					value={terminalHeight}
					min={100}
					max={900}
					invert
					label="Resize terminal"
					onChange={(next) => settings.handlePanelResize("terminalHeight", next)}
				/>
				<Suspense fallback={null}>
					<Terminal
						root={project.root}
						activePath={model.activePath}
						defaultFontSize={settings.effective.terminalFontSize}
						fontFamily={settings.effective.terminalFontFamily}
					/>
				</Suspense>
			</>
		);
	}

	if (project !== null && overlays.callsOpen && model.root !== null) {
		const cursor = overlays.callsCursor;
		if (model.activePath !== null && cursor !== null) {
			return (
				<CallsPanel
					root={model.root}
					path={model.activePath}
					cursor={cursor}
					onNavigate={workspace.handleNavigate}
					onClose={() => overlays.setCallsOpen(false)}
				/>
			);
		}
		return (
			<section className="calls-panel" aria-label="Call hierarchy">
				<div className="calls-head">
					<span className="calls-title">Calls</span>
					<button
						type="button"
						className="calls-close"
						onClick={() => overlays.setCallsOpen(false)}
					>
						close
					</button>
				</div>
				<div className="calls-body">
					<p className="calls-empty">Place the caret on a symbol</p>
				</div>
			</section>
		);
	}

	if (project !== null && overlays.typeHierarchyOpen && model.root !== null) {
		const cursor = overlays.typeHierarchyCursor;
		if (model.activePath !== null && cursor !== null) {
			return (
				<TypeHierarchyPanel
					root={model.root}
					path={model.activePath}
					cursor={cursor}
					onNavigate={workspace.handleNavigate}
					onClose={() => overlays.setTypeHierarchyOpen(false)}
				/>
			);
		}
	}

	if (project === null) return null;

	return (
		<BottomDock
			open
			expanded={model.panelExpanded}
			tab={panels.dockTab}
			dockHeight={settings.panels.dockHeight}
			problemFiles={diagnostics.files}
			counts={diagnostics.counts}
			root={model.root}
			activePath={model.activePath}
			buffers={workspace.buffers}
			onResize={(next) => settings.handlePanelResize("dockHeight", next)}
			onToggleExpanded={() => panels.setPanelOpen(!model.panelExpanded)}
			onSelectTab={panels.setDockTab}
			onSelectProblem={workspace.handleSelectProblem}
			onBuffersChange={workspace.setBuffers}
			tests={model.tests}
		/>
	);
}
