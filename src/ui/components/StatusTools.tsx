import {
	BuildIcon,
	DebugIcon,
	GitBranchIcon,
	IconButton,
	PanelIcon,
	RailIcon,
	RunIcon,
	StopIcon,
	TerminalIcon,
} from "@/ui/components/StatusBarIcons";

export type StatusToolsProps = {
	railCollapsed: boolean;
	terminalOpen: boolean;
	panelExpanded: boolean;
	gitOpen: boolean;
	debuggerActive: boolean;
	building: boolean;
	/** Stop was sent for the build in flight and the backend has not reported it finished yet. */
	stopping: boolean;
	running: boolean;
	hasProject: boolean;
	onToggleRail: () => void;
	onToggleTerminal: () => void;
	onTogglePanel: () => void;
	onToggleGit: () => void;
	onShowDebugger: () => void;
	onBuild: () => void;
	onStopBuild: () => void;
	onRun: () => void;
	onStop: () => void;
};

/** The left icon row: four panel toggles, a hairline, then Build and Run/Stop. */
export function StatusTools(props: StatusToolsProps) {
	// While a build runs the build button is the stop for it: CLion reaches the build from the same
	// place it launches one, and a cancelled build has to be reachable without a menu.
	const buildLabel = props.building ? (props.stopping ? "Stopping…" : "Stop build") : "Build";
	return (
		<span className="status-tools" role="toolbar" aria-label="Panels and build">
			<IconButton
				label="Toggle explorer"
				active={!props.railCollapsed}
				onClick={props.onToggleRail}
			>
				<RailIcon />
			</IconButton>
			<IconButton
				label="Toggle terminal"
				active={props.terminalOpen}
				onClick={props.onToggleTerminal}
			>
				<TerminalIcon />
			</IconButton>
			<IconButton
				label="Toggle panel"
				active={props.panelExpanded}
				onClick={props.onTogglePanel}
			>
				<PanelIcon />
			</IconButton>
			<IconButton label="Toggle git" active={props.gitOpen} onClick={props.onToggleGit}>
				<GitBranchIcon />
			</IconButton>
			<IconButton
				label="Show debugger"
				active={props.debuggerActive}
				onClick={props.onShowDebugger}
			>
				<DebugIcon />
			</IconButton>
			<span className="status-tools-sep" aria-hidden="true" />
			<IconButton
				label={buildLabel}
				disabled={!props.hasProject || props.stopping}
				onClick={props.building ? props.onStopBuild : props.onBuild}
			>
				{props.building ? <StopIcon /> : <BuildIcon />}
			</IconButton>
			<IconButton
				label={props.running ? "Stop" : "Run"}
				disabled={!props.running && !props.hasProject}
				onClick={props.running ? props.onStop : props.onRun}
			>
				{props.running ? <StopIcon /> : <RunIcon />}
			</IconButton>
		</span>
	);
}
