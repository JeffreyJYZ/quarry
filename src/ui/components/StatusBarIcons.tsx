import type { ReactNode } from "react";

/** Monochrome 16px glyphs for the status bar's left toggle row, in Zed's quiet register. */
function Glyph({ fill = "none", children }: { fill?: string; children: ReactNode }) {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 15 15"
			aria-hidden="true"
			focusable="false"
			fill={fill}
			stroke="currentColor"
			strokeWidth="1.1"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			{children}
		</svg>
	);
}

export function RailIcon() {
	return (
		<Glyph>
			<rect x="1.75" y="2.75" width="11.5" height="9.5" rx="1.5" />
			<path d="M6 2.75v9.5" />
		</Glyph>
	);
}

export function TerminalIcon() {
	return (
		<Glyph>
			<rect x="1.75" y="2.75" width="11.5" height="9.5" rx="1.5" />
			<path d="M4.5 6.5 6.25 8.25 4.5 10" />
			<path d="M8 10.25h2.5" />
		</Glyph>
	);
}

export function PanelIcon() {
	return (
		<Glyph>
			<rect x="1.75" y="2.75" width="11.5" height="9.5" rx="1.5" />
			<path d="M1.75 9.25h11.5" />
		</Glyph>
	);
}

export function DebugIcon() {
	return (
		<Glyph>
			<rect x="4.75" y="4.75" width="5.5" height="7.5" rx="2.75" />
			<path d="M5.4 4.9 4.25 3M9.6 4.9 10.75 3" />
			<path d="M4.75 7.5H2.5M10.25 7.5h2.25" />
			<path d="M4.75 10.5 2.75 12M10.25 10.5 12.25 12" />
		</Glyph>
	);
}

export function GitBranchIcon() {
	return (
		<Glyph>
			<circle cx="4.25" cy="3.75" r="1.6" />
			<circle cx="4.25" cy="11.25" r="1.6" />
			<circle cx="10.75" cy="4.75" r="1.6" />
			<path d="M4.25 5.35v4.3M10.75 6.35v1a2 2 0 0 1-2 2H5.85" />
		</Glyph>
	);
}

export function BuildIcon() {
	return (
		<Glyph>
			<path d="M7.5 2 13 5v5L7.5 13 2 10V5z" />
			<path d="M2 5 7.5 8 13 5M7.5 8v5" />
		</Glyph>
	);
}

export function RunIcon() {
	return (
		<Glyph fill="currentColor">
			<path d="M4.5 2.75 12 7.5 4.5 12.25z" />
		</Glyph>
	);
}

export function StopIcon() {
	return (
		<Glyph fill="currentColor">
			<rect x="3.75" y="3.75" width="7.5" height="7.5" rx="1.25" />
		</Glyph>
	);
}

/** One status-bar icon button: 22px hit area, pressed state carried, label in both title and name. */
export function IconButton({
	label,
	active = false,
	disabled = false,
	onClick,
	children,
}: {
	label: string;
	active?: boolean;
	disabled?: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			className={active ? "status-icon is-active" : "status-icon"}
			aria-label={label}
			aria-pressed={active}
			title={label}
			disabled={disabled}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

export type StatusToolsProps = {
	railCollapsed: boolean;
	terminalOpen: boolean;
	panelExpanded: boolean;
	gitOpen: boolean;
	debuggerActive: boolean;
	building: boolean;
	running: boolean;
	hasProject: boolean;
	onToggleRail: () => void;
	onToggleTerminal: () => void;
	onTogglePanel: () => void;
	onToggleGit: () => void;
	onShowDebugger: () => void;
	onBuild: () => void;
	onRun: () => void;
	onStop: () => void;
};

/** The left icon row: four panel toggles, a hairline, then Build and Run/Stop. */
export function StatusTools(props: StatusToolsProps) {
	const buildLabel = props.building ? "Building…" : "Build";
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
				disabled={!props.hasProject || props.building}
				onClick={props.onBuild}
			>
				<BuildIcon />
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
