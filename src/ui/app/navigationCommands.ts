import type { Command } from "@/ui/palette/CommandPalette";
import type { CommandContext } from "./commands";

/**
 * The language-server commands: symbol search, the two go-to variants and documentation.
 *
 * They all need a server and a position, so they share one `disabled` shape and live beside each
 * other rather than at the tail of the main list where the conditions repeat three times.
 */
export function navigationCommands(
	context: CommandContext,
	flags: { root: string | null; activePath: string | null; cursor: boolean },
): Command[] {
	const { root, activePath, cursor } = flags;
	const atCursor = root === null || activePath === null || !cursor;
	return [
		{
			id: "workspace-symbol",
			label: "Go to symbol in workspace…",
			hint: "Cmd+Alt+O",
			disabled: root === null,
			run: context.workspaceSymbol,
		},
		{
			id: "goto-implementation",
			label: "Go to implementation",
			hint: "Cmd+Alt+B",
			disabled: atCursor,
			run: context.gotoImplementation,
		},
		{
			id: "goto-type-definition",
			label: "Go to type definition",
			hint: "Cmd+Alt+Y",
			disabled: atCursor,
			run: context.gotoTypeDefinition,
		},
		{
			id: "quick-doc",
			label: "Quick documentation",
			hint: "F1",
			disabled: atCursor,
			run: context.quickDoc,
		},
	];
}
