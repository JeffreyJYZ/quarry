import { languageNameForPath } from "@/lib/editor/languages";

/** The short language name the status bar shows for a path. */
export function languageLabel(path: string | null): string | null {
	if (path === null) return null;
	const name = languageNameForPath(path);
	if (name !== null) return name;
	const dot = path.lastIndexOf(".");
	if (dot === -1) return null;
	return path.slice(dot + 1).toLowerCase();
}

/** Every accelerator the app answers to, grouped the way the sheet displays them. */
export const SHORTCUT_GROUPS = [
	{
		title: "Project",
		entries: [
			{ keys: ["Cmd", "K"], action: "Toggle shortcut sheet" },
			{ keys: ["Cmd", "Shift", "P"], action: "Open command palette" },
			{ keys: ["Cmd", ","], action: "Open settings" },
			{ keys: ["Cmd", ";"], action: "Open settings (same page)" },
			{ keys: ["?"], action: "Open shortcut sheet (outside editor)" },
		],
	},
	{
		title: "Editing",
		entries: [
			{ keys: ["Cmd", "S"], action: "Save active file" },
			{ keys: ["Cmd", "Alt", "S"], action: "Save all dirty files" },
			{ keys: ["Cmd", "F"], action: "Find in file" },
			{ keys: ["Cmd", "Alt", "F"], action: "Find in project" },
			{ keys: ["Cmd", "G"], action: "Next match" },
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
		],
	},
	{
		title: "Navigation",
		entries: [
			{ keys: ["Cmd", "P"], action: "Quick open by file name" },
			{ keys: ["Cmd", "Shift", "E"], action: "Reveal active file in explorer" },
			{ keys: ["F12"], action: "Go to definition" },
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
			{ keys: ["Cmd", "F10"], action: "Run to cursor" },
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
			{ keys: ["Cmd", "B"], action: "Toggle left rail" },
			{ keys: ["Cmd", "J"], action: "Toggle bottom dock" },
			{ keys: ["Cmd", "Shift", "D"], action: "Show debugger" },
			{ keys: ["Cmd", "Shift", "G"], action: "Toggle source control" },
		],
	},
];

/** What `buildProject` takes; the toolbar keeps the last pick for the session. */
export type BuildProfile = "debug" | "release";
