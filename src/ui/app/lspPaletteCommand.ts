import type { Command } from "@/ui/palette/CommandPalette";
import type { CommandContext } from "./commands";

/**
 * The language-server commands.
 *
 * Kept out of the main list so that list stays inside the file-size limit, and so every command that
 * talks to a server is added here rather than scattered through it.
 */
export function lspCommands(context: CommandContext): Command[] {
	return [
		{
			id: "restart-lsp",
			label: "Restart language server",
			hint: "⇧⌘R",
			disabled: context.root === null,
			disabledReason: context.root === null ? "No project is open" : undefined,
			run: context.restartLsp,
		},
	];
}
