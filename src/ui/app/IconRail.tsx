import type { ReactNode } from "react";
import type { ShellModel } from "@/ui/app/useShell";
import "@/ui/styles/icon-rail.css";

/** One rail glyph, drawn at a 1.4px stroke so it reads like a tool icon, not artwork. */
function Glyph({ children }: { children: ReactNode }) {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 18 18"
			aria-hidden="true"
			focusable="false"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.4"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			{children}
		</svg>
	);
}

const ICONS = {
	explorer: (
		<Glyph>
			<path d="M2.5 5.2a1.2 1.2 0 0 1 1.2-1.2h3l1.4 1.7h5.2a1.2 1.2 0 0 1 1.2 1.2v6.9a1.2 1.2 0 0 1-1.2 1.2H3.7a1.2 1.2 0 0 1-1.2-1.2z" />
		</Glyph>
	),
	search: (
		<Glyph>
			<circle cx="8" cy="8" r="4.6" />
			<path d="M11.4 11.4 15.5 15.5" />
		</Glyph>
	),
	git: (
		<Glyph>
			<circle cx="5.5" cy="4.5" r="1.9" />
			<circle cx="5.5" cy="13.5" r="1.9" />
			<circle cx="12.5" cy="7.5" r="1.9" />
			<path d="M5.5 6.4v5.2M12.5 9.4c0 2-1.6 2.6-3.4 3.1" />
		</Glyph>
	),
	problems: (
		<Glyph>
			<path d="M9 2.8 16 15H2z" />
			<path d="M9 7.2v3.4M9 12.6v.1" />
		</Glyph>
	),
	tests: (
		<Glyph>
			<path d="M4 4.5h5.5l3.5 3.5v6.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z" />
			<path d="M6.6 10.4 8.2 12l3.2-3.4" />
		</Glyph>
	),
	debugger: (
		<Glyph>
			<rect x="5.6" y="5.4" width="6.8" height="8" rx="3.4" />
			<path d="M7.4 5.4V3.8M10.6 5.4V3.8M5.6 8.2H2.8M5.7 11.6H3M12.4 8.2h2.8M12.3 11.6H15" />
		</Glyph>
	),
	terminal: (
		<Glyph>
			<rect x="2.5" y="3.5" width="13" height="11" rx="1.4" />
			<path d="M5.4 7.2 7.8 9.3 5.4 11.4M9.4 11.6h3.2" />
		</Glyph>
	),
	settings: (
		<Glyph>
			<circle cx="9" cy="9" r="2.3" />
			<path d="M9 2.6v1.7M9 13.7v1.7M2.6 9h1.7M13.7 9h1.7M4.5 4.5l1.2 1.2M12.3 12.3l1.2 1.2M13.5 4.5l-1.2 1.2M5.7 12.3l-1.2 1.2" />
		</Glyph>
	),
} as const;

/**
 * The left icon rail, the way an IDE puts its tools in one column.
 *
 * Every button either toggles the explorer or source-control panel, opens a search, or selects a
 * dock tab — the same actions the menu and the palette already reach, so the rail is a second door
 * to one implementation, never a second implementation.
 */
export default function IconRail({ model }: { model: ShellModel }) {
	const { panels, overlays } = model;
	const dockShown = (tab: string) => panels.panelOpen === true && panels.dockTab === tab;

	const buttons: {
		id: string;
		label: string;
		hint: string;
		active: boolean;
		onClick: () => void;
	}[] = [
		{
			id: "explorer",
			label: "Explorer",
			hint: "Cmd+1",
			active: !panels.railCollapsed,
			onClick: () => panels.setRailCollapsed((current) => !current),
		},
		{
			id: "search",
			label: "Search in project",
			hint: "Cmd+Shift+F",
			active: overlays.searchOpen,
			onClick: () => overlays.setSearchOpen(true),
		},
		{
			id: "git",
			label: "Source control",
			hint: "",
			active: panels.gitOpen,
			onClick: () => panels.setGitOpen((current) => !current),
		},
		{
			id: "problems",
			label: "Problems",
			hint: "",
			active: dockShown("problems"),
			onClick: () => panels.setDockTab("problems"),
		},
		{
			id: "tests",
			label: "Tests",
			hint: "",
			active: dockShown("tests"),
			onClick: () => panels.setDockTab("tests"),
		},
		{
			id: "debugger",
			label: "Debugger",
			hint: "Cmd+5",
			active: dockShown("debugger"),
			onClick: panels.showDebugger,
		},
	];

	return (
		<nav className="icon-rail" aria-label="Tools">
			{buttons.map((button) => (
				<button
					key={button.id}
					type="button"
					className={button.active ? "icon-rail-button active" : "icon-rail-button"}
					title={button.hint === "" ? button.label : `${button.label} (${button.hint})`}
					aria-label={button.label}
					aria-pressed={button.active}
					onClick={button.onClick}
				>
					{ICONS[button.id as keyof typeof ICONS]}
				</button>
			))}
			<span className="icon-rail-gap" />
			<button
				type="button"
				className={panels.terminalOpen ? "icon-rail-button active" : "icon-rail-button"}
				title="Terminal (Alt+F12)"
				aria-label="Terminal"
				aria-pressed={panels.terminalOpen}
				onClick={() => panels.setTerminalOpen((current) => !current)}
			>
				{ICONS.terminal}
			</button>
			<button
				type="button"
				className="icon-rail-button"
				title="Settings"
				aria-label="Settings"
				onClick={() => panels.setSettingsOpen(true)}
			>
				{ICONS.settings}
			</button>
		</nav>
	);
}
