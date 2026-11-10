/** Every accelerator the app answers to, grouped the way the sheet displays them. */

export type ShortcutEntry = {
	keys: string[];
	action: string;
	/** A native menu accelerator owns this chord, so the menu receives it before the window does. */
	menu?: boolean;
	/** The in-app command a menu accelerator shadows, and where else that command can be reached. */
	note?: string;
};

export type ShortcutGroup = {
	title: string;
	entries: ShortcutEntry[];
};

/** The shortcut sheet's groups, in display order. */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
	{
		title: "Project",
		entries: [
			{
				keys: ["Cmd", "K"],
				action: "Toggle shortcut sheet",
				menu: true,
				note: "The menu opens the sheet, so this chord no longer closes it.",
			},
			{ keys: ["Cmd", "Shift", "P"], action: "Open command palette" },
			{ keys: ["Cmd", ","], action: "Open settings", menu: true },
			{ keys: ["Cmd", ";"], action: "Open settings (same page)" },
			{ keys: ["?"], action: "Open shortcut sheet (outside editor)" },
			{
				keys: ["Cmd", "N"],
				action: "New project",
				menu: true,
				note: "The in-app generate binding on this chord never runs and has no other route.",
			},
			{
				keys: ["Cmd", "O"],
				action: "Open project",
				menu: true,
				note: 'The in-app go to class binding on this chord never runs; the palette row "Go to symbol in workspace…" opens that list.',
			},
		],
	},
	{
		title: "Editing",
		entries: [
			{ keys: ["Cmd", "S"], action: "Save active file", menu: true },
			{ keys: ["Cmd", "Alt", "S"], action: "Save all dirty files", menu: true },
			{ keys: ["Cmd", "F"], action: "Find in file" },
			{
				keys: ["Cmd", "Alt", "F"],
				action: "Find in project",
				menu: true,
				note: "The in-app in-file replace binding on this chord never runs and has no other route.",
			},
			{ keys: ["Cmd", "G"], action: "Next match" },
			{ keys: ["Cmd", "L"], action: "Go to line" },
			{ keys: ["Cmd", "Alt", "L"], action: "Format active file" },
			{ keys: ["Alt", "Enter"], action: "Code actions at the caret" },
		],
	},
	{
		title: "Editor",
		entries: [
			{ keys: ["Cmd", "D"], action: "Select the word, then the next occurrence" },
			{ keys: ["Cmd", "Shift", "L"], action: "Select every occurrence" },
			{ keys: ["Cmd", "U"], action: "Drop the last added range" },
			{ keys: ["Cmd", "/"], action: "Toggle a line comment" },
			{ keys: ["Cmd", "]"], action: "Indent" },
			{ keys: ["Cmd", "["], action: "Outdent" },
			{ keys: ["Cmd", "Shift", "K"], action: "Delete the line" },
			{ keys: ["Cmd", "Space"], action: "Completion" },
			{ keys: ["Cmd", "Shift", "Space"], action: "Signature help" },
			{ keys: ["Alt", "Enter"], action: "Code actions at the caret" },
			{ keys: ["Shift", "Alt", "T"], action: "Type hierarchy" },
			{ keys: ["Cmd", "Shift", "\\"], action: "Jump to the matching bracket" },
			{ keys: ["Cmd", "Shift", "["], action: "Fold the block" },
			{ keys: ["Cmd", "Shift", "]"], action: "Unfold the block" },
			{ keys: ["Cmd", "="], action: "Increase the editor font size" },
			{ keys: ["Cmd", "-"], action: "Decrease the editor font size" },
			{ keys: ["Cmd", "0"], action: "Reset the editor font size" },
		],
	},
	{
		title: "Navigation",
		entries: [
			{ keys: ["Cmd", "P"], action: "Quick open by file name", menu: true },
			{
				keys: ["Cmd", "Shift", "E"],
				action: "Reveal active file in explorer",
				menu: true,
			},
			{ keys: ["F12"], action: "Go to definition" },
			{
				keys: ["Cmd", "Alt", "K"],
				action: "Toggle a bookmark on the caret line",
			},
			{ keys: ["Shift", "F12"], action: "Find references" },
			{ keys: ["Cmd", "Click"], action: "Go to definition" },
		],
	},
	{
		title: "Build and run",
		entries: [
			{ keys: ["Ctrl", "R"], action: "Run the selected target" },
			{ keys: ["Ctrl", "D"], action: "Debug the selected target" },
			{ keys: ["Ctrl", "F2"], action: "Stop" },
			{ keys: ["Shift", "F10"], action: "Run" },
			{ keys: ["Shift", "F9"], action: "Debug" },
			{ keys: ["Cmd", "R"], action: "Rerun" },
		],
	},
	{
		title: "Debug",
		entries: [
			{ keys: ["Cmd", "F10"], action: "Run to cursor", menu: true },
			{ keys: ["Cmd", "F8"], action: "Toggle breakpoint on the caret line" },
			{ keys: ["F7"], action: "Step into" },
			{ keys: ["F8"], action: "Step over" },
			{ keys: ["Shift", "F8"], action: "Step out" },
			{ keys: ["F9"], action: "Resume" },
		],
	},
	{
		title: "Panels",
		entries: [
			{ keys: ["Esc"], action: "Close in-file search / sheet" },
			{ keys: ["Alt", "F12"], action: "Toggle terminal" },
		],
	},
	{
		title: "View",
		entries: [
			{ keys: ["Cmd", "B"], action: "Toggle left rail", menu: true },
			{
				keys: ["Cmd", "W"],
				action: "Close the active tab",
				menu: true,
				note: "File ▸ Close Window is a predefined macOS menu item whose chord is Cmd+W, so the in-app close-tab binding never runs.",
			},
			{ keys: ["Cmd", "Shift", "T"], action: "Reopen the last closed tab" },
			{ keys: ["Ctrl", "Tab"], action: "Next tab" },
			{ keys: ["Ctrl", "Shift", "Tab"], action: "Previous tab" },
			{ keys: ["Cmd", "J"], action: "Toggle bottom dock", menu: true },
			{ keys: ["Cmd", "6"], action: "Show TODO list" },
			{ keys: ["Cmd", "Shift", "D"], action: "Show debugger" },
			{ keys: ["Cmd", "Shift", "G"], action: "Toggle source control" },
		],
	},
];

/** Menu ids the shell dispatches; anything else arriving on the event is ignored. */
export const MENU_COMMAND_IDS: ReadonlySet<string> = new Set([
	"check-updates",
	"open-settings",
	"new-project",
	"open-project",
	"save",
	"save-all",
	"find-in-project",
	"quick-open",
	"toggle-rail",
	"toggle-dock",
	"toggle-terminal",
	"toggle-source-control",
	"toggle-debug",
	"toggle-blame",
	"show-shortcuts",
	"build",
	"run",
	"stop-run",
	"run-to-cursor",
	"refresh-git",
	"reveal-active-file",
]);
