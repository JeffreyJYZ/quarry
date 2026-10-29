import type { ShellModel } from "@/ui/app/useShell";
import { ICONS } from "@/ui/app/railIcons";
import type { DockTab } from "@/ui/tests/TestsDock";
import "@/ui/styles/icon-rail.css";

/**
 * The left icon rail, the way an IDE puts its tools in one column.
 *
 * Every button either toggles the explorer or source-control panel, opens a search, or selects a
 * dock tab — the same actions the menu and the palette already reach, so the rail is a second door
 * to one implementation, never a second implementation.
 */
export default function IconRail({ model }: { model: ShellModel }) {
	const { panels, overlays } = model;
	/** The left column shows one view at a time, and stays lit only while it is actually on screen. */
	const columnShown = (git: boolean) => !panels.railCollapsed && panels.gitOpen === git;
	const dockShown = (tab: DockTab) => model.panelExpanded && panels.dockTab === tab;

	/** Picking a view opens the column on it, so a click from a collapsed rail never lands nowhere. */
	const showColumn = (git: boolean) => {
		panels.setRailCollapsed(false);
		panels.setGitOpen(git);
	};

	/** A second click on the view already showing hides the column, like every other rail toggle. */
	const toggleColumn = (git: boolean) => {
		if (columnShown(git)) panels.setRailCollapsed(true);
		else showColumn(git);
	};

	/** Dock buttons select their tab and expand the dock; a second click collapses it again. */
	const toggleDockTab = (tab: DockTab) => {
		if (dockShown(tab)) {
			panels.setPanelOpen(false);
			return;
		}
		panels.setDockTab(tab);
		panels.setPanelOpen(true);
	};

	/** Tool windows need a project; without one their buttons would only light up and do nothing. */
	const hasProject = model.root !== null;

	const buttons: {
		id: string;
		label: string;
		hint: string;
		active: boolean;
		disabled?: boolean;
		onClick: () => void;
	}[] = [
		{
			id: "explorer",
			label: "Explorer",
			hint: "Cmd+B",
			active: columnShown(false),
			onClick: () => toggleColumn(false),
		},
		{
			id: "search",
			label: "Search in project",
			hint: "Cmd+Shift+F",
			active: overlays.searchOpen,
			onClick: () => overlays.setSearchOpen((current) => !current),
		},
		{
			id: "git",
			label: "Source control",
			hint: "Cmd+Shift+G",
			active: hasProject && columnShown(true),
			disabled: !hasProject,
			onClick: () => toggleColumn(true),
		},
		{
			id: "problems",
			label: "Problems",
			hint: "",
			active: hasProject && dockShown("problems"),
			disabled: !hasProject,
			onClick: () => toggleDockTab("problems"),
		},
		{
			id: "tests",
			label: "Tests",
			hint: "",
			active: hasProject && dockShown("tests"),
			disabled: !hasProject,
			onClick: () => toggleDockTab("tests"),
		},
		{
			id: "debugger",
			label: "Debugger",
			hint: "Cmd+Shift+D",
			active: hasProject && dockShown("debugger"),
			disabled: !hasProject,
			onClick: () => toggleDockTab("debugger"),
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
					disabled={button.disabled}
					onClick={button.onClick}
				>
					{ICONS[button.id as keyof typeof ICONS]}
				</button>
			))}
			<span className="icon-rail-gap" />
			<div className="icon-rail-footer">
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
			</div>
		</nav>
	);
}
