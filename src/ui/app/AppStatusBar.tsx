import type { OverlaysProps } from "@/ui/app/AppOverlays";
import StatusBar from "@/ui/components/StatusBar";

/**
 * The workbench's status bar, wired from the overlay props.
 *
 * It lives beside `AppOverlays` rather than inside it: the two together are one file over the size
 * limit, and the bar's own wiring is a job of its own — the Run/Stop pair and the Build button that
 * becomes the stop for the build it started.
 */
export default function AppStatusBar(props: OverlaysProps) {
	return (
		<StatusBar
			project={props.project}
			git={props.gitStatus}
			missingTools={props.missingTools}
			saveError={props.saveError}
			caret={props.caret}
			errors={props.counts.errors}
			warnings={props.counts.warnings}
			language={props.language}
			encoding={props.encoding}
			tabSize={props.tabSize}
			status={props.status}
			onOpenSettings={props.onOpenSettings}
			railCollapsed={props.railCollapsed}
			terminalOpen={props.terminalOpen}
			panelExpanded={props.panelExpanded}
			gitOpen={props.gitOpen}
			debuggerActive={props.debuggerActive}
			building={props.building}
			stopping={props.stopping}
			running={props.running}
			onToggleRail={props.onToggleRail}
			onToggleTerminal={props.onToggleTerminal}
			onTogglePanel={props.onTogglePanel}
			onToggleGit={props.onToggleGit}
			onShowDebugger={props.onShowDebugger}
			onBuild={props.onBuild}
			onStopBuild={props.onStopBuild}
			onRun={props.onRun}
			onStop={props.onStop}
		/>
	);
}
