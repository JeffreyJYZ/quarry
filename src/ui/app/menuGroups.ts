export type MenuItem = {
	id: string;
	label: string;
	accel?: string;
	needsProject?: boolean;
	needsFile?: boolean;
};
export type MenuGroup = { label: string; items: (MenuItem | "separator")[] };

export const MENU_GROUPS: MenuGroup[] = [
	{
		label: "File",
		items: [
			{ id: "new-project", label: "New project" },
			{ id: "open-project", label: "Open project" },
			"separator",
			{ id: "save", label: "Save", accel: "Cmd+S", needsFile: true },
			{ id: "save-all", label: "Save all", accel: "Cmd+Alt+S", needsProject: true },
			"separator",
			{ id: "format", label: "Format file", accel: "Cmd+Alt+L", needsFile: true },
		],
	},
	{
		label: "Edit",
		items: [
			{
				id: "find-in-project",
				label: "Find in project",
				accel: "Cmd+Alt+F",
				needsProject: true,
			},
			{ id: "quick-open", label: "Quick open", accel: "Cmd+P", needsProject: true },
			{ id: "show-shortcuts", label: "Show shortcuts", accel: "Cmd+K" },
		],
	},
	{
		label: "View",
		items: [
			{ id: "toggle-rail", label: "Toggle rail", accel: "Cmd+B" },
			{ id: "toggle-dock", label: "Toggle dock", accel: "Cmd+J" },
			{ id: "toggle-terminal", label: "Toggle terminal", needsProject: true },
			{ id: "toggle-source-control", label: "Toggle source control", needsProject: true },
			{ id: "toggle-debug", label: "Toggle debug", needsProject: true },
			{
				id: "reveal-active-file",
				label: "Reveal active file",
				accel: "Cmd+Shift+E",
				needsFile: true,
			},
		],
	},
	{
		label: "Run",
		items: [
			{ id: "build", label: "Build", needsProject: true },
			{ id: "run", label: "Run", needsProject: true },
			{ id: "stop-run", label: "Stop run" },
			{ id: "run-to-cursor", label: "Run to cursor", accel: "Cmd+F10", needsFile: true },
		],
	},
	{
		label: "Git",
		items: [
			{ id: "refresh-git", label: "Refresh git", needsProject: true },
			{ id: "toggle-blame", label: "Toggle blame", needsProject: true, needsFile: true },
		],
	},
	{
		label: "Help",
		items: [{ id: "check-updates", label: "Check for updates" }],
	},
];
