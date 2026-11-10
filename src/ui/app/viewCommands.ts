import type { Command } from "@/ui/palette/CommandPalette";
import type { CommandContext } from "./commands";

/**
 * The view toggles: the rail, the dock, the terminal and the split editor.
 *
 * They live here rather than in the main list because each is one flag flip with no arguments, and
 * the list itself is at its file-size limit.
 */
export function viewCommands(context: CommandContext): Command[] {
	const { root, activePath } = context;
	return [
		{
			id: "toggle-rail",
			label: "Toggle rail",
			hint: "Cmd+B",
			run: context.toggleRail,
		},
		{
			id: "toggle-dock",
			label: "Toggle dock",
			hint: "Cmd+J",
			run: context.toggleDock,
		},
		{
			id: "toggle-terminal",
			label: "Toggle terminal",
			hint: "",
			disabled: root === null,
			run: context.toggleTerminal,
		},
		{
			id: "toggle-split",
			label: "Split editor right",
			hint: "Cmd+`",
			disabled: root === null,
			run: context.toggleSplit,
		},
		{
			id: "reveal-active-file",
			label: "Reveal active file in explorer",
			hint: "Cmd+Shift+E",
			disabled: root === null || activePath === null,
			run: context.revealFile,
		},
	];
}
