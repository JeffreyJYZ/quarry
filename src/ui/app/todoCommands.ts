import type { Command } from "@/ui/palette/CommandPalette";
import type { CommandContext } from "./commands";

/**
 * The tool windows the palette can open.
 *
 * One row per dock tab that has a shortcut: the debugger's row lives beside the run commands, and
 * this one is here so the palette's list keeps one entry per tool rather than growing the list file.
 */
export function todoCommands(context: CommandContext): Command[] {
	return [
		{
			id: "show-todo",
			label: "Show TODO list",
			hint: "Cmd+6",
			disabled: context.root === null,
			run: context.showTodos,
		},
	];
}
